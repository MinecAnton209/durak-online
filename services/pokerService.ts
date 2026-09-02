import type { TypedServer } from '../types/index.js';
import type {
  PokerGameState,
  PokerPlayer,
  PokerGameType,
  PokerTournament,
  BlindLevel,
  SidePot,
  Card,
  HandResult,
  ShowdownWinner,
  PokerSocketData,
} from '../types/poker.js';
import { createDeck, shuffle, RANK_VALUES } from '../utils/pokerDeck.js';
import { evaluateHand, compareHands } from '../utils/pokerHands.js';
import crypto from 'node:crypto';
import db from '../db/drizzle.js';
import { eq } from 'drizzle-orm';
import { game, gameParticipant } from '../db/schema.ts';

type GameMap = Record<string, PokerGameState>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let io: any;
let games: GameMap = {};

export function initPoker(sharedIo: TypedServer, sharedGames: GameMap) {
  io = sharedIo;
  games = sharedGames as unknown as GameMap;
}

export function getPokerGame(gameId: string): PokerGameState | undefined {
  return games[gameId];
}

export function handlePokerPlayerDisconnect(socket: any, game: PokerGameState): void {
  const player = game.players[socket.id];
  if (!player) return;

  console.log(`[Poker] Player ${player.name} disconnected from ${game.id}`);

  if (game.status === 'waiting') {
    // In waiting state, mark as disconnected but keep their seat
    // so they can reconnect with the same role (especially host).
    player.isConnected = false;
    io.to(game.id).emit('pokerPlayerDisconnected', { playerId: socket.id, name: player.name });
    io.to('lobby_browser').emit('pokerLobbies', listPokerLobbies());
    return;
  }

  if (game.status === 'in_progress') {
    player.isConnected = false;
    io.to(game.id).emit('pokerPlayerDisconnected', { playerId: socket.id, name: player.name });
    // Auto-fold if it's their turn
    if (game.playerOrder[game.currentPlayerIdx] === socket.id) {
      try {
        const idx = game.playerOrder.indexOf(socket.id);
        // Reuse the fold path indirectly: call playerFold via internal
        // Emit fold and advance turn via a server-side timer
        setTimeout(() => {
          const stillHere = games[game.id];
          if (!stillHere) return;
          const p = stillHere.players[socket.id];
          if (!p || p.folded || p.isAllIn) return;
          p.folded = true;
          io.to(game.id).emit('pokerPlayerFolded', { playerId: socket.id });
          const active = stillHere.playerOrder.filter((id) => !stillHere.players[id]?.folded);
          if (active.length <= 1) {
            void endHand(stillHere, [stillHere.players[active[0]!]!]);
            return;
          }
          // Advance to next acting player
          let next = (stillHere.currentPlayerIdx + 1) % stillHere.playerOrder.length;
          while (stillHere.players[stillHere.playerOrder[next]!]?.folded || stillHere.players[stillHere.playerOrder[next]!]?.isAllIn) {
            next = (next + 1) % stillHere.playerOrder.length;
          }
          stillHere.currentPlayerIdx = next;
          advanceToNextActingPlayer(stillHere);
        }, 30000);
      } catch (e) {
        console.error('[Poker] Auto-fold on disconnect failed:', e);
      }
    }
  }
}

export function listPokerLobbies(): Array<{ gameId: string; players: number; maxPlayers: number; gameType: string; smallBlind: number; bigBlind: number; startingChips: number }> {
  return Object.entries(games)
    .filter(([, g]) => g.status === 'waiting' && g.gameType.includes('poker'))
    .map(([gameId, g]) => ({
      gameId,
      players: g.playerOrder.length,
      maxPlayers: g.maxPlayers ?? 10,
      gameType: g.gameType,
      smallBlind: g.smallBlind ?? 5,
      bigBlind: g.bigBlind ?? 10,
      startingChips: g.startingChips ?? 1000,
    }));
}

/** Create a new poker game and persist lobby row. Returns gameId. */
export async function createPokerLobby(
  socket: any,
  settings: {
    gameType: PokerGameType;
    maxPlayers: number;
    startingChips: number;
    smallBlind: number;
    bigBlind: number;
    blindStructure?: BlindLevel[];
    tournamentId?: string;
  },
): Promise<string> {
  const sessionUser = socket.request.session?.user;
  const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
  console.log(`[PokerService] createPokerLobby gameId=${gameId} by ${sessionUser?.username || socket.id}`);
  const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

  const starting = settings.startingChips;
  const sb = settings.smallBlind;
  const bb = settings.bigBlind;

  const pokerGames: GameMap = games as unknown as GameMap;
  pokerGames[gameId] = {
    id: gameId,
    gameType: settings.gameType,
    status: 'waiting',
    players: {},
    playerOrder: [],
    dealerBtn: 0,
    currentPlayerIdx: 0,
    bettingRound: 'preflop',
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    deck: [],
    tournamentId: settings.tournamentId ?? null,
    blindStructure: settings.blindStructure ?? [{ smallBlind: sb, bigBlind: bb, durationMs: 0 }],
    currentBlindLevel: 0,
    blindTimerEndsAt: null,
    log: [],
    maxPlayers: settings.maxPlayers,
    smallBlind: sb,
    bigBlind: bb,
    startingChips: starting,
  };

  const state = pokerGames[gameId]!;
  state.players[socket.id] = {
    id: socket.id,
    dbId: sessionUser ? sessionUser.id : null,
    name: sessionUser ? sessionUser.username : (socket.data.playerName ?? 'Guest'),
    chips: starting,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    folded: false,
    isAllIn: false,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    isConnected: true,
    hasActedThisRound: false,
  };
  state.playerOrder.push(socket.id);

  const hostUserId = sessionUser ? sessionUser.id : null;
  await db.insert(game).values({
    id: gameId,
    status: 'waiting',
    lobby_type: 'public',
    invite_code: inviteCode,
    max_players: settings.maxPlayers,
    host_user_id: hostUserId,
    game_settings: JSON.stringify({
      gameType: settings.gameType,
      startingChips: starting,
      smallBlind: sb,
      bigBlind: bb,
      blindStructure: settings.blindStructure,
      tournamentId: settings.tournamentId,
      maxPlayers: settings.maxPlayers,
    }),
    start_time: new Date().toISOString(),
    game_type: settings.gameType,
  });

  io.to(gameId).emit('pokerLobbyUpdate', { gameId, inviteCode, maxPlayers: settings.maxPlayers });
  io.to('lobby_browser').emit('pokerLobbies', listPokerLobbies());
  return gameId;
}

/** Join an existing poker game. */
export async function joinPokerGame(socket: any, gameId: string): Promise<boolean> {
  const state = getPokerGame(gameId);
  if (!state) {
    return false;
  }
  if (state.status !== 'waiting') {
    socket.emit('error', { message: 'Game already started' });
    return false;
  }
  // Already joined — idempotent (same socket)
  if (state.players[socket.id]) {
    io.to(gameId).emit('pokerLobbies', listPokerLobbies());
    return true;
  }

  const sessionUser = socket.request.session?.user;
  const userDbId = sessionUser ? sessionUser.id : null;

  // Reconnect handling: if a player with same dbId already exists (waiting state),
  // update their socket.id and re-seat them. Preserves their position in playerOrder.
  if (userDbId) {
    const existingId = Object.keys(state.players).find((pid) => state.players[pid]?.dbId === userDbId);
    const oldPlayer = existingId ? state.players[existingId] : null;
    if (existingId && oldPlayer && existingId !== socket.id) {
      delete state.players[existingId];
      const idx = state.playerOrder.indexOf(existingId);
      if (idx !== -1) state.playerOrder[idx] = socket.id;
      state.players[socket.id] = { ...oldPlayer, id: socket.id, isConnected: true } as PokerPlayer;
      console.log(`[Poker] ${oldPlayer.name} reconnected: ${existingId} -> ${socket.id}`);
      io.to(gameId).emit('pokerPlayerJoined', { playerId: socket.id });
      io.to('lobby_browser').emit('pokerLobbies', listPokerLobbies());
      // Re-broadcast state
      const pub = {
        id: state.id, gameType: state.gameType, status: state.status,
        players: Object.values(state.players).map((p) => ({ id: p.id, name: p.name, chips: p.chips, folded: p.folded, isAllIn: p.isAllIn, cardCount: p.cards?.length || 0, currentBet: p.currentBet })),
        playerOrder: state.playerOrder, pot: state.pot, currentBet: state.currentBet, bettingRound: state.bettingRound,
        maxPlayers: state.maxPlayers ?? 10, smallBlind: state.smallBlind ?? 5, bigBlind: state.bigBlind ?? 10, startingChips: state.startingChips ?? 1000,
      };
      io.to(gameId).emit('pokerLobbyState', pub);
      return true;
    }
  }

  if (state.playerOrder.length >= (state.maxPlayers ?? 10)) {
    socket.emit('error', { message: 'Game is full' });
    return false;
  }

  const startingChips = state.startingChips ?? getDefaultChips(state.gameType);
  state.players[socket.id] = {
    id: socket.id,
    dbId: sessionUser ? sessionUser.id : null,
    name: sessionUser ? sessionUser.username : (socket.data.playerName ?? 'Guest'),
    chips: startingChips,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    folded: false,
    isAllIn: false,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    isConnected: true,
    hasActedThisRound: false,
  };
  state.playerOrder.push(socket.id);

  io.to(gameId).emit('pokerPlayerJoined', { playerId: socket.id });
  io.to('lobby_browser').emit('pokerLobbies', listPokerLobbies());
  // Broadcast updated lobby state to everyone in the game (so host sees new player)
  const state2 = getPokerGame(gameId);
  if (state2) {
    const pub = {
      id: state2.id,
      gameType: state2.gameType,
      status: state2.status,
      players: Object.values(state2.players).map((p: any) => ({
        id: p.id, name: p.name, chips: p.chips, folded: p.folded, isAllIn: p.isAllIn, cardCount: p.cards?.length || 0, currentBet: p.currentBet,
      })),
      playerOrder: state2.playerOrder,
      pot: state2.pot, currentBet: state2.currentBet, bettingRound: state2.bettingRound,
      maxPlayers: state2.maxPlayers ?? 10, smallBlind: state2.smallBlind ?? 5, bigBlind: state2.bigBlind ?? 10, startingChips: state2.startingChips ?? 1000,
    };
    io.to(gameId).emit('pokerLobbyState', pub);
  }
  return true;
}

function getDefaultChips(gameType: PokerGameType): number {
  return gameType === 'poker_holdem_tournament' ? 1000 : 1000;
}

/** Start the poker game — deal hole cards, post blinds, begin preflop betting */
export function startPoker(gameId: string): boolean {
  const state = getPokerGame(gameId);
  if (!state) return false;
  if (state.playerOrder.length < 2) {
    io?.to(gameId).emit('pokerError', { message: 'Need at least 2 players' });
    return false;
  }

  state.status = 'in_progress';
  state.deck = shuffle(createDeck());
  dealHoleCards(state);

  // Post blinds (2+ players minimum; for 2 players, small blind is dealer)
  postBlinds(state);

  // Start blind timer for tournament mode
  startBlindTimer(state);

  state.bettingRound = 'preflop';
  // Preflop: action starts from the player after the big blind
  state.currentPlayerIdx = (state.dealerBtn + 3) % state.playerOrder.length;

  // Edge case: heads-up — SB is dealer, BB is small blind in standard.
  // For 2 players, button = SB position, BB acts first preflop.
  if (state.playerOrder.length === 2) {
    state.currentPlayerIdx = (state.dealerBtn + 1) % 2;
  }

  broadcastState(state, 'pokerGameStarted');
  io.to('lobby_browser').emit('pokerLobbies', listPokerLobbies());
  emitActionForCurrent(state);
  return true;
}

function dealHoleCards(state: PokerGameState): void {
  const dealOrder = [...state.playerOrder];
  for (let i = 0; i < 2; i++) {
    for (const pid of dealOrder) {
      const player = state.players[pid];
      if (player && state.deck.length > 0) {
        const card = state.deck.pop();
        if (card) {
          player.cards.push(card);
        }
      }
    }
  }
}

function postBlinds(state: PokerGameState): void {
  const players = state.playerOrder.length;
  const blinds = getCurrentBlinds(state);

  if (players === 2) {
    // Heads-up: dealer = SB, other = BB
    const sbIdx = state.dealerBtn;
    const bbIdx = (state.dealerBtn + 1) % 2;
    const sbPid = state.playerOrder[sbIdx]!;
    const bbPid = state.playerOrder[bbIdx]!;
    const sbPlayer = state.players[sbPid]!;
    const bbPlayer = state.players[bbPid]!;

    sbPlayer.isDealer = true;
    bbPlayer.isBigBlind = true;
    sbPlayer.isSmallBlind = true;

    sbPlayer.chips -= blinds.smallBlind;
    bbPlayer.chips -= blinds.bigBlind;
    sbPlayer.currentBet = blinds.smallBlind;
    bbPlayer.currentBet = blinds.bigBlind;
    state.currentBet = blinds.bigBlind;
  } else if (players >= 3) {
    const sbIdx = (state.dealerBtn + 1) % players;
    const bbIdx = (state.dealerBtn + 2) % players;

    const sbPid = state.playerOrder[sbIdx]!;
    const bbPid = state.playerOrder[bbIdx]!;
    const sbPlayer = state.players[sbPid]!;
    const bbPlayer = state.players[bbPid]!;

    bbPlayer.isBigBlind = true;
    sbPlayer.isSmallBlind = true;

    sbPlayer.chips -= blinds.smallBlind;
    bbPlayer.chips -= blinds.bigBlind;
    sbPlayer.currentBet = blinds.smallBlind;
    bbPlayer.currentBet = blinds.bigBlind;
    state.currentBet = blinds.bigBlind;
  }

  deductPlayerBets(state);
}

function deductPlayerBets(state: PokerGameState): void {
  for (const pid of state.playerOrder) {
    const player = state.players[pid];
    if (player && player.currentBet > 0) {
      player.totalBet = player.currentBet;
    }
  }
}

function getCurrentBlinds(state: PokerGameState): BlindLevel {
  const blinds = state.blindStructure ?? [];
  const level = state.blindStructure ? blinds[state.currentBlindLevel] : null;
  if (!level) {
    return { smallBlind: 5, bigBlind: 10, durationMs: 0 };
  }
  return level;
}

function startBlindTimer(state: PokerGameState): void {
  if (state.gameType !== 'poker_holdem_tournament') return;
  const blinds = state.blindStructure ?? [];
  if (state.currentBlindLevel >= blinds.length - 1) return;

  const level = blinds[state.currentBlindLevel]!;
  state.blindTimerEndsAt = Date.now() + level.durationMs;

  const timer = setTimeout(() => {
    escalateBlinds(state);
  }, level.durationMs);

  // Store reference; cleaned up on game end
  void timer;
}

function escalateBlinds(state: PokerGameState): void {
  if (!state.blindStructure || state.currentBlindLevel >= state.blindStructure.length - 1) return;
  state.currentBlindLevel += 1;
  io?.to(state.id).emit('blindLevelUp', { level: state.currentBlindLevel });
  startBlindTimer(state);
}

/** Player actions */
export async function playerBet(socket: any, gameId: string, amount: number): Promise<boolean> {
  const state = getPokerGame(gameId);
  if (!state || state.status !== 'in_progress') return false;

  const player = state.players[socket.id];
  if (!player || player.folded || player.isAllIn) return false;

  const totalCallAmount = state.currentBet - player.totalBet;

  if (amount < totalCallAmount) {
    socket.emit('error', { message: 'Amount too low, must call' });
    return false;
  }

  if (amount > player.chips) {
    socket.emit('error', { message: 'Not enough chips' });
    return false;
  }

  const totalToPutIn = player.totalBet + amount;
  player.chips -= amount;
  player.currentBet += amount;
  player.totalBet = totalToPutIn;

  if (player.chips === 0) {
    player.isAllIn = true;
  }

  state.pot += amount;
  if (totalToPutIn > state.currentBet) {
    state.currentBet = totalToPutIn; // new raise
  }

  player.hasActedThisRound = true;
  advanceToNextActingPlayer(state);
  return true;
}

export async function playerCall(socket: any, gameId: string): Promise<boolean> {
  const state = getPokerGame(gameId);
  if (!state || state.status !== 'in_progress') return false;

  const player = state.players[socket.id];
  if (!player || player.folded || player.isAllIn) return false;

  const amountToCall = state.currentBet - player.totalBet;
  if (amountToCall === 0) return playerCheck(socket, gameId);

  const callAmount = Math.min(amountToCall, player.chips);
  player.chips -= callAmount;
  player.currentBet += callAmount;
  player.totalBet += callAmount;

  if (player.chips === 0) {
    player.isAllIn = true;
  }

  state.pot += callAmount;
  player.hasActedThisRound = true;

  if (player.isAllIn) {
    return true;
  }

  advanceToNextActingPlayer(state);
  return true;
}

export async function playerCheck(socket: any, gameId: string): Promise<boolean> {
  const state = getPokerGame(gameId);
  if (!state || state.status !== 'in_progress') return false;

  const player = state.players[socket.id];
  if (!player || player.folded || player.isAllIn) return false;

  const amountToCall = state.currentBet - player.totalBet;
  if (amountToCall > 0) {
    socket.emit('error', { message: 'Cannot check, must call or raise' });
    return false;
  }

  player.hasActedThisRound = true;
  advanceToNextActingPlayer(state);
  return true;
}

export async function playerRaise(socket: any, gameId: string, amount: number): Promise<boolean> {
  return playerBet(socket, gameId, amount);
}

export async function playerFold(socket: any, gameId: string): Promise<boolean> {
  const state = getPokerGame(gameId);
  if (!state || state.status !== 'in_progress') return false;

  const player = state.players[socket.id];
  if (!player || player.folded || player.isAllIn) return false;

  player.folded = true;
  player.hasActedThisRound = true;

  io.to(gameId).emit('pokerPlayerFolded', { playerId: socket.id });

  // Check if only one player remains
  const activePlayers = Object.values(state.players).filter((p) => !p.folded);
  if (activePlayers.length === 1) {
    await endHand(state, [activePlayers[0]!]);
    return true;
  }

  advanceToNextActingPlayer(state);
  return true;
}

export async function playerAllIn(socket: any, gameId: string): Promise<boolean> {
  const state = getPokerGame(gameId);
  if (!state || state.status !== 'in_progress') return false;

  const player = state.players[socket.id];
  if (!player || player.folded || player.isAllIn) return false;

  const allInAmount = player.chips;
  player.chips = 0;
  player.currentBet += allInAmount;
  player.totalBet += allInAmount;
  player.isAllIn = true;
  state.pot += allInAmount;

  player.hasActedThisRound = true;

  io.to(gameId).emit('pokerPlayerWentAllIn', { playerId: socket.id });

  // Rebuild side pots
  rebuildSidePots(state);

  advanceToNextActingPlayer(state);
  return true;
}

function rebuildSidePots(state: PokerGameState): void {
  const players = Object.values(state.players);
  const activePlayers = players.filter((p) => !p.folded);

  if (activePlayers.length === 0) {
    state.sidePots = [];
    return;
  }

  // Simple side pot algorithm:
  // 1. Collect all unique totalBet values
  // 2. Build layer by layer
  const contributionLevels = Array.from(
    new Set(activePlayers.map((p) => p.totalBet)),
  ).sort((a, b) => a - b);

  const sidePots: SidePot[] = [];
  let remainingPot = state.pot;
  let accumulated = 0;

  for (const level of contributionLevels) {
    if (level === 0) continue;
    const levelAmount = level - accumulated;
    if (levelAmount <= 0) {
      accumulated = level;
      continue;
    }

    const eligible = activePlayers
      .filter((p) => p.totalBet >= level)
      .map((p) => p.id);

    if (eligible.length === 0) break;

    const potShare = levelAmount * eligible.length;
    sidePots.push({
      amount: potShare,
      eligiblePlayerIds: eligible,
      wonBy: null,
    });

    remainingPot -= potShare;
    accumulated = level;
  }

  // Remaining pot goes to main if someone over-bet
  if (remainingPot > 0 && sidePots.length > 0) {
    const lastPot = sidePots[sidePots.length - 1]!;
    lastPot.amount += remainingPot;
  } else if (remainingPot > 0) {
    sidePots.push({
      amount: remainingPot,
      eligiblePlayerIds: activePlayers.map((p) => p.id),
      wonBy: null,
    });
  }

  state.sidePots = sidePots;
}

function advanceToNextActingPlayer(state: PokerGameState): void {
  const activePlayers = state.playerOrder.filter((pid) => {
    const p = state.players[pid];
    return p && !p.folded && !p.isAllIn;
  });

  if (activePlayers.length <= 1) {
    return;
  }

  // Find current player index in active players
  let currentIdx = activePlayers.indexOf(state.playerOrder[state.currentPlayerIdx]!);
  if (currentIdx === -1) {
    currentIdx = 0;
  }

  // Check if all active players have matched the current bet or folded/all-in
  let allMatched = true;
  for (const pid of activePlayers) {
    const p = state.players[pid]!;
    if (p.totalBet < state.currentBet && !p.isAllIn) {
      allMatched = false;
      break;
    }
  }

  // Has everyone had a chance to act and match bets? (at least one non-all-in has acted)
  const someoneCanAct = activePlayers.some(
    (pid) => !state.players[pid]!.hasActedThisRound && !state.players[pid]!.isAllIn,
  );

  if (allMatched && !someoneCanAct) {
    // Betting round complete
    endBettingRound(state);
    return;
  }

  // Move to next active player who hasn't folded/all-in
  currentIdx = (currentIdx + 1) % activePlayers.length;
  state.currentPlayerIdx = state.playerOrder.indexOf(activePlayers[currentIdx]!);

  const nextPlayer = state.playerOrder[state.currentPlayerIdx]!;
  io.to(state.id).emit('pokerActionRequired', {
    gameId: state.id,
    playerId: nextPlayer,
    minCall: state.currentBet - state.players[nextPlayer]!.totalBet,
    minRaise: state.currentBet * 2,
  });
}

function endBettingRound(state: PokerGameState): void {
  // Reset for next round
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    if (p) {
      p.totalBet = 0;
      p.hasActedThisRound = false;
    }
  }
  state.currentBet = 0; // will be set by first better next round

  switch (state.bettingRound) {
    case 'preflop':
      dealFlop(state);
      return;
    case 'flop':
      dealTurn(state);
      return;
    case 'turn':
      dealRiver(state);
      return;
    case 'river':
      // Showdown
      resolveShowdown(state);
      return;
    default:
      return;
  }
}

function dealFlop(state: PokerGameState): void {
  state.bettingRound = 'flop';
  // Burn one, deal three
  state.deck.pop(); // burn
  for (let i = 0; i < 3; i++) {
    const card = state.deck.pop();
    if (card) state.communityCards.push(card);
  }

  // Set starting bet and find first actor
  state.currentBet = 0;
  findFirstToAct(state);

  broadcastState(state, 'pokerFlopDealt');
  emitActionForCurrent(state);
}

function dealTurn(state: PokerGameState): void {
  state.bettingRound = 'turn';
  state.deck.pop(); // burn
  const card = state.deck.pop();
  if (card) state.communityCards.push(card);

  state.currentBet = 0;
  findFirstToAct(state);

  broadcastState(state, 'pokerTurnDealt');
  emitActionForCurrent(state);
}

function dealRiver(state: PokerGameState): void {
  state.bettingRound = 'river';
  state.deck.pop(); // burn
  const card = state.deck.pop();
  if (card) state.communityCards.push(card);

  state.currentBet = 0;
  findFirstToAct(state);

  broadcastState(state, 'pokerRiverDealt');
  emitActionForCurrent(state);
}

function emitActionForCurrent(state: PokerGameState): void {
  const pid = state.playerOrder[state.currentPlayerIdx];
  if (!pid) return;
  const p = state.players[pid];
  if (!p || p.folded || p.isAllIn) {
    advanceToNextActingPlayer(state);
    return;
  }
  io.to(state.id).emit('pokerActionRequired', {
    gameId: state.id,
    playerId: pid,
    minCall: state.currentBet - p.totalBet,
    minRaise: state.currentBet * 2,
  });
}

function findFirstToAct(state: PokerGameState): void {
  const activePlayers = state.playerOrder.filter((pid) => {
    const p = state.players[pid];
    return p && !p.folded && !p.isAllIn;
  });

  if (activePlayers.length === 0) return;

  // First to act is the first active player after the dealer
  const firstActiveIdx = state.playerOrder.indexOf(activePlayers[0]!);
  state.currentPlayerIdx = firstActiveIdx;
}

async function resolveShowdown(state: PokerGameState): Promise<void> {
  state.bettingRound = 'showdown';

  const activePlayers = Object.values(state.players).filter((p) => !p.folded);

  if (activePlayers.length <= 1) {
    // Only one player didn't fold
    const winner = activePlayers[0];
    if (winner) {
      await endHand(state, [winner]);
    }
    return;
  }

  // Evaluate hands
  const showdownResults: Array<{ playerId: string; handRank: HandResult }> = [];

  for (const player of activePlayers) {
    const allCards = [...player.cards, ...state.communityCards];
    const handRank = evaluateHand(allCards);
    showdownResults.push({ playerId: player.id, handRank });
  }

  // Sort by hand strength (best first)
  showdownResults.sort((a, b) => compareHands(b.handRank, a.handRank));

  // Determine winners (including ties)
  const winners: string[] = [showdownResults[0]!.playerId];
  const bestRank = showdownResults[0]!.handRank;

  for (let i = 1; i < showdownResults.length; i++) {
    if (compareHands(showdownResults[i]!.handRank, bestRank) === 0) {
      winners.push(showdownResults[i]!.playerId);
    } else {
      break;
    }
  }

  await awardPots(state, winners, showdownResults);
  await endHand(state, winners.map((pid) => state.players[pid]!));
}

async function awardPots(
  state: PokerGameState,
  winners: string[],
  results: Array<{ playerId: string; handRank: HandResult }>,
): Promise<void> {
  // For simplicity: award total pot to winners (side pot logic would refine this)
  const totalPot = state.pot;
  const share = Math.floor(totalPot / winners.length);
  const remainder = totalPot - share * winners.length;

  const winnersWithResults = winners
    .map((pid) => ({ player: state.players[pid]!, rank: results.find((r) => r.playerId === pid)?.handRank }))
    .filter((w): w is { player: PokerPlayer; rank: HandResult } => w.player && w.rank !== undefined);

  for (const { player } of winnersWithResults) {
    const isLastWinner = player.id === winnersWithResults[winnersWithResults.length - 1]?.player.id;
    player.chips += share + (isLastWinner ? remainder : 0);
    player.totalBet = 0;
    player.currentBet = 0;
  }

  io.to(state.id).emit('pokerShowdown', {
    winners: winnersWithResults.map((w) => ({
      playerId: w.player.id,
      handRank: w.rank,
    })),
    pot: totalPot,
    allCards: state.playerOrder.map((pid) => ({
      playerId: pid,
      name: state.players[pid]?.name,
      cards: state.players[pid]?.cards || [],
      folded: state.players[pid]?.folded,
    })),
  });
}

async function endHand(state: PokerGameState, winners: PokerPlayer[]): Promise<void> {
  state.status = 'finished';

  io.to(state.id).emit('pokerHandComplete', {
    winners: winners.map((p) => ({ id: p.id, name: p.name, chips: p.chips })),
  });

  // Persist to DB
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    if (p?.dbId) {
      try {
        await db
          .update(gameParticipant)
          .set({
            outcome: winners.some((w) => w.id === pid) ? 'won' : 'lost',
            cards_at_end: p.chips,
          })
          .where(
            db.sql`${gameParticipant.game_id} = ${state.id} AND ${gameParticipant.user_id} = ${p.dbId}`,
          );
      } catch {
        // Player may not have a gameParticipant row (guest)
      }
    }
  }

  // Save game result
  if (winners.length > 0 && winners[0]!.dbId) {
    await db
      .update(game)
      .set({
        status: 'finished',
        end_time: new Date().toISOString(),
        winner_user_id: winners[0]!.dbId,
      })
      .where(eq(game.id, state.id));
  }

  delete games[state.id];
}

function serializeState(state: PokerGameState) {
  return {
    id: state.id,
    gameType: state.gameType,
    status: state.status,
    players: Object.values(state.players).map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      folded: p.folded,
      isAllIn: p.isAllIn,
      isDealer: p.isDealer,
      isSmallBlind: p.isSmallBlind,
      isBigBlind: p.isBigBlind,
      cardCount: p.cards.length,
      currentBet: p.currentBet,
    })),
    playerOrder: state.playerOrder,
    communityCards: state.communityCards,
    pot: state.pot,
    currentBet: state.currentBet,
    bettingRound: state.bettingRound,
    dealerBtn: state.dealerBtn,
    currentPlayerIdx: state.currentPlayerIdx,
    minRaise: state.currentBet * 2,
    smallBlind: state.smallBlind ?? 5,
    bigBlind: state.bigBlind ?? 10,
    startingChips: state.startingChips ?? 1000,
    maxPlayers: state.maxPlayers ?? 10,
  };
}

/** Broadcast state to all players + per-player hole cards (private). */
function broadcastState(state: PokerGameState, eventName: string) {
  const pub = serializeState(state);
  for (const pid of state.playerOrder) {
    const player = state.players[pid];
    if (!player) continue;
    const sock = io?.sockets?.sockets?.get?.(pid);
    if (!sock) continue;
    sock.emit(eventName, { ...pub, players: pub.players.map((sp: any) => sp.id === pid ? { ...sp, cards: player.cards } : sp) });
  }
}
