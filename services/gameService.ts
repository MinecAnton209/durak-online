import { eq, and, inArray, sql } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { game, gameParticipant, user } from '../db/schema.ts';
import { createDeck, RANK_VALUES, getNextPlayerIndex, updateTurn, checkGameOver } from '../utils/gameLogic.js';
import statsService from './statsService.js';
import achievementService from './achievementService.js';
import ratingService from './ratingService.js';
import * as pokerService from './pokerService.js';

// During this window the deal animation plays; moves and the turn timer are locked.
const DEAL_ANIMATION_MS = 4000;

import type { GameState } from '../types/index.js';
import { getGame } from '../types/index.js';
let io: any;
let games: Record<string, GameState> = {};

function isDealingActive(game: any) {
  return !!(game.dealEndsAt && Date.now() < game.dealEndsAt);
}

function init(socketIo: any, activeGames: Record<string, GameState>) {
  io = socketIo;
  games = activeGames;
}

function addPlayerToGame(socket: any, game: any, playerName: any) {
  const sessionUser = socket.request.session.user;
  game.players[socket.id] = {
    id: socket.id,
    deviceId: socket.deviceId,
    name: sessionUser ? sessionUser.username : playerName,
    dbId: sessionUser ? sessionUser.id : null,
    isGuest: !sessionUser,
    cardBackStyle: sessionUser ? sessionUser.card_back_style : 'default',
    streak: sessionUser ? sessionUser.streak : 0,
    rating: sessionUser ? Math.round(sessionUser.rating) : 0,
    isVerified: sessionUser ? sessionUser.isVerified : false,
    is_muted: sessionUser ? sessionUser.is_muted : false,
    cards: [],
    gameStats: { cardsTaken: 0, successfulDefenses: 0, cardsBeatenInDefense: 0 },
    afkStrikes: 0
  };
  game.playerOrder.push(socket.id);
}

function logEvent(game: any, message: any, options: any = {}) {
  if (!game.log) game.log = [];
  const timestamp = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const logEntry = { timestamp, ...options };
  if (typeof message === 'string' && !options.i18nKey) {
    logEntry.message = message;
  }
  game.log.push(logEntry);
  if (game.log.length > 50) game.log.shift();
  if (io) {
    io.to(game.id).emit('newLogEntry', logEntry);
  }
}

async function startGame(gameId: any) {
  const game = getGame(games, gameId) as any;
  if (!game) return;
  // game is GameState
  game.status = 'in_progress';
  const betAmount = game.settings.betAmount || 0;
  if (betAmount > 0) {
    game.bank = 0;
    const playerDbIds: number[] = [];

    game.playerOrder.forEach((socketId: any) => {
      const player = game.players[socketId];
      if (player && !player.isGuest) {
        playerDbIds.push(player.dbId);
        game.bank! += betAmount;
      }
    });

    if (playerDbIds.length > 0) {
      try {
        await db
          .update(user)
          .set({ coins: sql`${user.coins} - ${betAmount}` })
          .where(inArray(user.id, playerDbIds.filter((id: any) => id !== null)));
        console.log(`[Economy] Bets deducted for game ${gameId}. Bank is ${game.bank}`);
      } catch (error: any) {
        console.error(`[Economy] CRITICAL: Failed to deduct bets for game ${gameId}. Cancelling game.`, error.message);
        if (io) io.to(gameId).emit('error', { i18nKey: 'error_bet_deduction_failed' });
        delete games[gameId];
        return;
      }
    }
  }
  game.startTime = new Date();
  game.dealEndsAt = Date.now() + DEAL_ANIMATION_MS;
  game.deck = createDeck(game.settings.deckSize);
  game.trumpCard = game.deck.length > 0 ? game.deck[game.deck.length - 1] : { suit: '♠', rank: '' };
  game.trumpSuit = game.trumpCard ? game.trumpCard.suit : null;
  let firstAttackerIndex = 0;
  let minTrumpRank = Infinity;
  game.playerOrder.forEach((playerId: any, index: number) => {
    const player: any = game.players[playerId];
    if (!player) return;
    player.cards = game.deck.splice(0, 6);
    player.cards.forEach((card: any) => {
      if (card.suit === (game.trumpSuit as any) && (RANK_VALUES[card.rank as string] as any) < minTrumpRank) {
        minTrumpRank = (RANK_VALUES[card.rank as string] as any);
        firstAttackerIndex = index;
      }
    });
  });
  const gameType = `${game.playerOrder.length}_player`;
  const hostUserId = game.players[game.hostId]?.dbId || null;
  const isBotGame = Object.values(game.players).some((p: any) => p.isGuest);

  try {
    await db
      .update(game)
      .set({
        start_time: game.startTime.toISOString(),
        game_type: gameType,
        is_bot_game: isBotGame,
        status: 'in_progress',
        host_user_id: hostUserId
      })
      .where(eq(game.id, game.id as any));

    await db.delete(gameParticipant).where(eq(gameParticipant.game_id, game.id));

    for (let index = 0; index < game.playerOrder.length; index++) {
      const playerId: any = game.playerOrder[index];
      const player: any = game.players[playerId];
      const isFirstAttacker = index === firstAttackerIndex;

      if (player?.dbId) {
        await db.insert(gameParticipant).values({
          game_id: game.id,
          user_id: player.dbId,
          is_bot: player.isGuest,
          is_first_attacker: isFirstAttacker
        });
      }
    }
  } catch (err: any) {
    console.error(`Error starting game ${game.id} in DB:`, err.message);
  }
  logEvent(game, null, {
    i18nKey: 'log_game_start',
    options: { trump: game.trumpSuit, player: game.players[game.playerOrder[firstAttackerIndex]].name }
  });
  updateTurn(game, firstAttackerIndex);
  broadcastGameState(gameId);
  if (io) io.emit('lobbyStarted', { lobbyId: gameId });

  // Re-broadcast when the deal window ends so the turn timer and bots start.
  if (game.dealEndsAt) {
    const remaining = game.dealEndsAt - Date.now();
    setTimeout(() => {
      const currentGameCheck = games[gameId]; if (currentGameCheck && !currentGameCheck.winner) broadcastGameState(gameId);
    }, remaining);
  }
}

function refillHands(game: any) {
  const attackerIndex = game.playerOrder.indexOf(game.attackerId);
  if (attackerIndex === -1) return;
  for (let i = 0; i < game.playerOrder.length; i++) {
    const playerIndex = (attackerIndex + i) % game.playerOrder.length;
    const player = game.players[game.playerOrder[playerIndex]];
    if (player) {
      const cardsToDraw = 6 - player.cards.length;
      if (cardsToDraw > 0 && game.deck.length > 0) {
        const drawnCards = game.deck.splice(0, cardsToDraw);
        player.cards.push(...drawnCards);
        logEvent(game, null, {
          i18nKey: 'log_draw_cards',
          options: { name: player.name, count: drawnCards.length }
        });
        console.log(`[Game] ${player.name} drew ${drawnCards.length} cards in game ${game.id}`);
      }
    }
  }
}

async function updateStatsAfterGame(game: any) {
  stopTurnTimer(game);
  if (game.isStatsUpdating) {
    console.log(`[Stats] Update for game ${game.id} already in progress. Skipping.`);
    return;
  }
  // Skip non-durak games (poker) — they have their own endHand
  if (game.gameType?.includes('poker')) return;
  // Skip if missing critical fields (crash-safe)
  if (!game.winner || !game.winner.winners || !game.winner.hasOwnProperty('loser')) return;
  game.isStatsUpdating = true;
  console.log(`[GAME END ${game.id}] Starting stats update.`);

  const endTime = new Date();
  const durationSeconds = game.startTime
    ? Math.round((endTime.getTime() - game.startTime.getTime()) / 1000)
    : 0;
  const hasBots = Object.values(game.players).some((p: any) => p?.isBot);

  try {
    await db.transaction(async (tx: any) => {
      const { winners, loser } = game.winner;
      const winnerDbIds = winners.filter((p: any) => p && !p.isGuest).map((p: any) => p.dbId!);
      const loserDbId = loser && !loser.isGuest ? loser.dbId : null;

      await tx
        .update(game)
        .set({
          end_time: endTime.toISOString(),
          duration_seconds: durationSeconds,
          winner_user_id: winnerDbIds.length > 0 ? winnerDbIds[0] : null,
          loser_user_id: loserDbId
        })
        .where(eq(game.id, game.id as any));

      await statsService.incrementDailyCounter('games_played', tx);

      const allPlayersInGame = [...winners, loser].filter((p: any) => p);

      for (const player of allPlayersInGame) {
        if (player && !player.isGuest && player.dbId) {
          const outcome = winners.some((w: any) => w.id === player.id) ? 'win' : 'loss';
          await tx
            .update(gameParticipant)
            .set({ outcome, cards_at_end: player.cards.length })
            .where(and(eq(gameParticipant.game_id, game.id), eq(gameParticipant.user_id, player.dbId)));

          const userData = await tx
            .select({
              streak_count: user.streak_count,
              last_played_date: user.last_played_date,
              wins: user.wins,
              losses: user.losses,
              win_streak: user.win_streak
            })
            .from(user)
            .where(eq(user.id, player.dbId));
          const foundUser = userData[0];
          if (!foundUser) throw new Error(`User not found for ID: ${player.dbId}`);

          const isWinner = outcome === 'win';
          const newWinStreak = isWinner ? (foundUser.win_streak || 0) + 1 : 0;
          await achievementService.checkPostGameAchievements(game, player, foundUser, newWinStreak);

          const today = new Date().toISOString().slice(0, 10);
          const lastPlayed = foundUser.last_played_date;
          let newStreak = 1;
          if (lastPlayed) {
            const lastDate = new Date(lastPlayed);
            const todayDate = new Date(today);
            const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 0) newStreak = foundUser.streak_count;
            else if (diffDays === 1) newStreak = foundUser.streak_count + 1;
          }

          await tx
            .update(user)
            .set(
              isWinner
                ? { wins: sql`${user.wins} + 1`, streak_count: newStreak, last_played_date: today, win_streak: newWinStreak }
                : { losses: sql`${user.losses} + 1`, streak_count: newStreak, last_played_date: today, win_streak: 0 }
            )
            .where(eq(user.id, player.dbId));
        }
      }

      const betAmount = game.settings.betAmount || 0;
      if (betAmount > 0 && game.bank > 0) {
        const txWinners = game.winner.winners.filter((p: any) => p && !p.isGuest);

        if (txWinners.length > 0) {
          const prizePerWinner = Math.floor(game.bank / txWinners.length);
          console.log(`[Economy] Awarding ${prizePerWinner} coins to ${txWinners.length} winner(s) for game ${game.id}.`);
          for (const winner of txWinners) {
            await tx
              .update(user)
              .set({ coins: sql`${user.coins} + ${prizePerWinner}` })
              .where(eq(user.id, winner.dbId));
          }
        } else {
          console.log(`[Economy] No registered winners in game ${game.id}. Refunding bets.`);

          const allRegisteredPlayers = Object.values(game.players).filter((p: any) => p && !p.isGuest);

          if (allRegisteredPlayers.length > 0) {
            await tx
              .update(user)
              .set({ coins: sql`${user.coins} + ${betAmount}` })
              .where(inArray(user.id, allRegisteredPlayers.map((p: any) => p.dbId!)));
            console.log(`[Economy] Refunded ${betAmount} coins to ${allRegisteredPlayers.length} players.`);

            allRegisteredPlayers.forEach((player: any) => {
              const playerSocket = io.sockets.sockets.get(player.id);
              if (playerSocket) {
                playerSocket.emit('systemMessage', { i18nKey: 'info_bet_refunded' });
                if (playerSocket.request.session.user) {
                  playerSocket.request.session.user.coins += betAmount;
                  playerSocket.request.session.save();
                }
              }
            });
          }
        }
      }

      if (hasBots) {
        console.log(`[Rating] Game ${game.id} had bots. Rating update skipped.`);
      } else {
        await ratingService.updateRatingsAfterGame(game, tx);
      }
    });

  } catch (error: any) {
    console.error(`[GAME END ${game.id}] FATAL ERROR during stats update. Rolling back.`, error);
  } finally {
    if (game) {
      game.isStatsUpdating = false;
    }
  }
}

function stopTurnTimer(game: any) {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }
  game.turnDeadline = null;
}

function startTurnTimer(game: any) {
  stopTurnTimer(game);

  // Lock the timer while the deal animation plays so the first turn can't time out.
  if (isDealingActive(game)) return;

  if (!game.settings.turnDuration || game.settings.turnDuration <= 0 || game.winner) return;

  const durationMs = game.settings.turnDuration * 1000 + 2000;
  game.turnDeadline = Date.now() + durationMs;

  game.turnTimer = setTimeout(() => {
    handleTurnTimeout(game);
  }, durationMs);
}

function handleTurnTimeout(game: any) {
  if (!game || game.winner) return;

  const currentPlayerId = game.turn;
  const player = game.players[currentPlayerId];

  if (!player) return;

  console.log(`[Game] Timeout for ${player.name} in game ${game.id}`);

  player.afkStrikes = (player.afkStrikes || 0) + 1;

  if (player.afkStrikes >= 2) {
    console.log(`[Game] Player ${player.name} kicked due to AFK limit.`);

    delete game.players[currentPlayerId];
    game.playerOrder = game.playerOrder.filter((id: any) => id !== currentPlayerId);

    if (io) io.to(game.id).emit('playerLeft', { playerId: currentPlayerId, name: player.name, reason: 'afk' });
    logEvent(game, `🚫 ${player.name} removed from the game due to inactivity.`);

    if (game.playerOrder.length < 2) {
      const winners = game.playerOrder.map((id: any) => (game.players as any)[id]);
      game.winner = {
        winners: winners,
        loser: { ...player, name: player.name + ' (AFK)' },
        reason: { i18nKey: 'game_over_afk', options: { name: player.name } }
      };
      game.status = 'finished';
      updateStatsAfterGame(game);
    } else {
      const nextIndex = 0;
      updateTurn(game, nextIndex);
    }
    broadcastGameState(game.id);
    return;
  }

  if (game.turn === game.defenderId) {
    logEvent(game, null, { i18nKey: 'log_timeout_take', options: { name: player.name } });

    const defender = player;
    defender.gameStats.cardsTaken += game.table.length;
    defender.cards.push(...game.table);
    game.table = [];
    refillHands(game);

    if (checkGameOver(game)) updateStatsAfterGame(game);
    else {
      const defenderIndex = game.playerOrder.indexOf(game.defenderId);
      const nextPlayerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
      updateTurn(game, nextPlayerIndex);
    }
  } else {
    if (game.table.length > 0) {
      logEvent(game, null, { i18nKey: 'log_timeout_pass', options: { name: player.name } });

      game.discardPile.push(...game.table);
      game.table = [];
      refillHands(game);

      if (checkGameOver(game)) updateStatsAfterGame(game);
      else {
        const defenderIndex = game.playerOrder.indexOf(game.defenderId);
        updateTurn(game, defenderIndex !== -1 ? defenderIndex : 0);
      }
    } else {
      const sortedCards = [...player.cards].sort((a, b) => {
        const isTrumpA = a.suit === game.trumpSuit;
        const isTrumpB = b.suit === game.trumpSuit;
        if (isTrumpA !== isTrumpB) return isTrumpA ? 1 : -1;
        const ranks: Record<string, number> = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        return (ranks as any)[a.rank] - (ranks as any)[b.rank];
      });

      const cardToPlay = sortedCards[0];

      if (cardToPlay) {
        console.log(`[Game] Auto-playing card for ${player.name}: ${cardToPlay.rank}${cardToPlay.suit}`);

        player.cards = player.cards.filter((c: any) => c !== cardToPlay);

        game.table.push(cardToPlay);
        game.lastAction = 'move';
        game.turn = game.defenderId;

        logEvent(game, null, { i18nKey: 'log_attack', options: { name: player.name, rank: cardToPlay.rank, suit: cardToPlay.suit } });
      }
    }
  }

  broadcastGameState(game.id);
}

function broadcastGameState(gameId: any) {
  const game: any = getGame(games, gameId);
  if (!game) return;

  if (game.status === 'in_progress' && !game.winner) {
    startTurnTimer(game);
  } else {
    stopTurnTimer(game);
  }

  if (!io) return;

  game.playerOrder.forEach((playerId: any) => {
    const playerSocket = io.sockets.sockets.get(playerId);
    if (playerSocket) {
      const playerForWhomStateIs = game.players[playerId];
      if (!playerForWhomStateIs) return;
      const stateForPlayer = {
        gameId: game.id,
        hostId: game.hostId,
        isSpectator: false,
        players: game.playerOrder.map((id: string) => {
          const p = game.players[id];
          if (!p) return null;
          return {
            id: p.id,
            name: p.name,
            rating: p.rating,
            isVerified: p.isVerified,
            streak: p.streak || 0,
            cardBackStyle: p.cardBackStyle || 'default',
            cards: p.id === playerId ? p.cards : p.cards.map(() => ({ hidden: true })),
            isAttacker: p.id === game.attackerId,
            isDefender: p.id === game.defenderId
          };
        }).filter((p: any) => p !== null),
        table: game.table,
        trumpCard: game.trumpCard,
        trumpSuit: game.trumpSuit,
        deckCardCount: game.deck.length,
        isYourTurn: playerId === game.turn && playerForWhomStateIs.cards.length > 0,
        turnDeadline: game.turnDeadline,
        dealEndsAt: game.dealEndsAt || null,
        canPass: playerId === game.attackerId && game.table.length > 0 && game.table.length % 2 === 0,
        canTake: playerId === game.defenderId && game.table.length > 0,
        winner: game.winner,
        lastAction: game.lastAction,
        musicState: game.musicState
      };
      playerSocket.emit('gameStateUpdate', stateForPlayer);
    }
  });
  if (game.spectators) game.spectators.forEach((spectatorSocketId: any) => {
    const spectatorSocket = io.sockets.sockets.get(spectatorSocketId);
    if (spectatorSocket) {
      const stateForSpectator = {
        gameId: game.id,
        hostId: game.hostId,
        isSpectator: true,
        players: game.playerOrder.map((id: any) => {
          const p = game.players[id];
          if (!p) return null;
          return {
            id: p.id,
            name: p.name,
            rating: p.rating,
            isVerified: p.isVerified,
            streak: p.streak || 0,
            cardBackStyle: p.cardBackStyle || 'default',
            cards: p.cards,
            isAttacker: p.id === game.attackerId,
            isDefender: p.id === game.defenderId
          };
        }).filter((p: any) => p !== null),
        table: game.table,
        trumpCard: game.trumpCard,
        trumpSuit: game.trumpSuit,
        deckCardCount: game.deck.length,
        isYourTurn: false,
        canPass: false,
        canTake: false,
        winner: game.winner,
        lastAction: game.lastAction,
        musicState: game.musicState
      };
      spectatorSocket.emit('gameStateUpdate', stateForSpectator);
    }
  });
  const room = io.sockets.adapter.rooms.get(game.id);
  if (room) {
    room.forEach((socketId: any) => {
      if (!game.players[socketId] && !game.spectators.includes(socketId)) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          const stateForSpectator = {
            gameId: game.id,
            hostId: game.hostId,
            isSpectator: true,
            players: game.playerOrder.map((id: any) => {
              const p = game.players[id];
              if (!p) return null;
              return {
                id: p.id,
                name: p.name,
                rating: p.rating,
                isVerified: p.isVerified,
                streak: p.streak || 0,
                cardBackStyle: p.cardBackStyle || 'default',
                cards: p.cards,
                isAttacker: p.id === game.attackerId,
                isDefender: p.id === game.defenderId
              };
            }).filter((p: any) => p !== null),
            table: game.table,
            trumpCard: game.trumpCard,
            trumpSuit: game.trumpSuit,
            deckCardCount: game.deck.length,
            isYourTurn: false,
            canPass: false,
            canTake: false,
            winner: game.winner,
            lastAction: game.lastAction,
            musicState: game.musicState
          };
          socket.emit('gameStateUpdate', stateForSpectator);
        }
      }
    });
  }
  if (game.status === 'in_progress' && !game.winner) {
    const currentPlayer = game.players[game.turn];
    if (currentPlayer && currentPlayer.isBot && !isDealingActive(game)) {
      processBotTurn(game);
    }
  }
}

function broadcastPublicLobbies() {
  if (!io) return;
  const publicLobbies = Object.values(games)
    .filter((game) => {
      return (
        game.status === 'waiting' &&
        game.settings?.lobbyType === 'public' &&
        game.playerOrder &&
        game.playerOrder.length > 0
      );
    })
    .map((game) => ({
      gameId: game.id,
      hostName: game.players[game.hostId]?.name || 'Unknown',
      playerCount: game.playerOrder.length,
      maxPlayers: game.settings.maxPlayers,
      betAmount: game.settings.betAmount || 0,
      deckSize: game.settings.deckSize || 36,
      gameMode: game.settings.gameMode || 'podkidnoy'
    }));

  io.to('lobby_browser').emit('lobbyListUpdate', publicLobbies);
  io.to('lobby_browser').emit('pokerLobbies', pokerService.listPokerLobbies());
}

function handlePlayerDisconnect(socket: any, game: any) {
  const disconnectedPlayer = game.players[socket.id];
  if (!disconnectedPlayer) return;

  if (game.status === 'waiting') {
    console.log(`[Lobby] Player ${disconnectedPlayer.name} leaving lobby ${game.id}...`);

    delete game.players[socket.id];
    game.playerOrder = game.playerOrder.filter((id: any) => id !== socket.id);

    if (game.playerOrder.length > 0) {
      const humanIds = game.playerOrder.filter((id: any) => game.players[id] && !game.players[id].isBot);
      if (humanIds.length === 0) {
        delete games[game.id];
        db.update(game).set({ status: 'cancelled' }).where(eq(game.id, game.id as any)).catch(() => {});
        io.emit('lobbyExpired', { lobbyId: game.id });
        console.log(`[Lobby] Lobby ${game.id} has only bots and was deleted.`);
      } else {
        if (game.hostId === socket.id) {
          game.hostId = humanIds[0];
          const newHostName = game.players[game.hostId].name;
          console.log(`[Lobby] Host left. New host for ${game.id} is ${newHostName}`);
          logEvent(game, null, { i18nKey: 'log_new_host', options: { name: newHostName } });
        }

        io.to(game.id).emit('lobbyStateUpdate', {
          players: Object.values(game.players).map((p: any) => ({
            id: p.id,
            name: p.name,
            rating: p.rating,
            isVerified: p.isVerified,
            isHost: p.id === game.hostId,
            isBot: p.isBot || false
          })),
          hostId: game.hostId,
          maxPlayers: game.settings.maxPlayers,
          settings: game.settings
        });
        io.to(game.id).emit('playerLeft', { playerId: socket.id, name: disconnectedPlayer.name });
        console.log(`[Lobby] ${disconnectedPlayer.name} removed. Lobby ${game.id} updated.`);
      }
    } else {
      delete games[game.id];
      db.update(game).set({ status: 'cancelled' }).where(eq(game.id, game.id as any)).catch(() => {});
      io.emit('lobbyExpired', { lobbyId: game.id });
      console.log(`[Lobby] Lobby ${game.id} is empty and was deleted.`);
    }
    broadcastPublicLobbies();
  } else if (game.status === 'in_progress' && !game.winner) {
    console.log(`[Game] Player ${disconnectedPlayer.name} disconnected from active game ${game.id}. Starting reconnect timer...`);

    disconnectedPlayer.disconnected = true;
    disconnectedPlayer.disconnectTime = Date.now();

    io.to(game.id).emit('playerDisconnected', {
      playerId: socket.id,
      timeout: 60
    });
    logEvent(game, null, { i18nKey: 'log_player_disconnected', options: { name: disconnectedPlayer.name } });

    disconnectedPlayer.reconnectTimeout = setTimeout(() => {
      const currentGame: any = games[game.id];
      if (!currentGame || !currentGame.players[socket.id] || !currentGame.players[socket.id].disconnected) {
        console.log(`[Reconnect] Timer for ${disconnectedPlayer.name} in ${game.id} cancelled or player already reconnected.`);
        return;
      }

      if (currentGame.status === 'finished') return;

      console.log(`[Game] Reconnect timeout for ${disconnectedPlayer.name}. Player removed permanently from ${game.id}.`);
      const playerWhoLeft = { ...currentGame.players[socket.id] };

      delete currentGame.players[socket.id];
      currentGame.playerOrder = currentGame.playerOrder.filter((id: any) => id !== socket.id);

      if (currentGame.playerOrder.length < 2) {
        console.log(`[Game] Game ${game.id} finished due to timeout.`);
        if (currentGame.status !== 'finished') {
          stopTurnTimer(currentGame);
          currentGame.winner = {
            winners: (currentGame.playerOrder.map((id: any) => (currentGame.players as any)[id]).filter((p: any) => p)) as any,
            loser: playerWhoLeft,
            reason: { i18nKey: 'game_over_player_left_timeout', options: { player: playerWhoLeft.name } }
          };
          currentGame.status = 'finished';
        }
        updateStatsAfterGame(currentGame);
      } else {
        logEvent(currentGame, null, { i18nKey: 'log_player_left_continue', options: { name: playerWhoLeft.name } });
        if (currentGame.turn === socket.id) {
          const nextIndex = 0;
          updateTurn(currentGame, nextIndex);
        }
      }
      broadcastGameState(game.id);
    }, 60000);
  }
}

async function processBotTurn(game: any) {
  if (!game || game.status !== 'in_progress' || game.winner || game.isStatsUpdating) return;

  const activePlayerId = game.turn;
  const player = game.players[activePlayerId];

  if (!player || !player.isBot) return;

  if (player.isThinking) return;
  player.isThinking = true;

  const botLogic = await import('./botLogic.js'); // Import here to avoid circular dependency if any

  const delay = Math.random() * 2000 + 1000;
  setTimeout(() => {
    if (!game || game.status !== 'in_progress' || game.winner) {
      if (player) player.isThinking = false;
      return;
    }

    const result = botLogic.getBotMove(game, player);
    const move = result.action || result;
    if (move) {
      if (move.type === 'attack' || (move.type === 'move' && game.defenderId !== activePlayerId)) {
        const card = move.card;
        player.cards = player.cards.filter((c: any) => c !== card);
        game.table.push(card);
        game.lastAction = 'move';
        game.turn = game.defenderId;
        logEvent(game, null, { i18nKey: 'log_attack', options: { name: player.name, rank: card.rank, suit: card.suit } });
      } else if (move.type === 'defend' || (move.type === 'move' && game.defenderId === activePlayerId)) {
        const card = move.card;
        const targetIndex = game.table.length - 1;
        player.cards = player.cards.filter((c: any) => c !== card);
        game.table[targetIndex + 1] = card;
        game.lastAction = 'move';
        player.gameStats.successfulDefenses++;
        player.gameStats.cardsBeatenInDefense++;
        logEvent(game, null, { i18nKey: 'log_defend', options: { name: player.name, rank: card.rank, suit: card.suit } });

        const attackers = game.playerOrder.filter((id: any) => id !== game.defenderId && (game.players as any)[id]?.cards?.length > 0);
        if (attackers.length > 0) {
          game.turn = attackers[0];
        }
      } else if (move.type === 'pass') {
        logEvent(game, null, { i18nKey: 'log_pass', options: { name: player.name } });
        const attackerIndex = game.playerOrder.indexOf(game.attackerId);
        const nextAttackerIndex = getNextPlayerIndex(attackerIndex, game.playerOrder.length);
        const nextAttackerId = game.playerOrder[nextAttackerIndex];

        if (nextAttackerId === game.defenderId || game.table.length >= Math.min(6, game.players[game.defenderId].cards.length * 2)) {
          game.discardPile.push(...game.table);
          game.table = [];
          refillHands(game);
          if (checkGameOver(game)) {
            updateStatsAfterGame(game);
          } else {
            const defenderIndex = game.playerOrder.indexOf(game.defenderId);
            updateTurn(game, defenderIndex);
          }
        } else {
          game.turn = nextAttackerId;
        }
      } else if (move.type === 'take') {
        logEvent(game, null, { i18nKey: 'log_take', options: { name: player.name } });
        player.gameStats.cardsTaken += game.table.length;
        player.cards.push(...game.table);
        game.table = [];
        refillHands(game);
        if (checkGameOver(game)) {
          updateStatsAfterGame(game);
        } else {
          const defenderIndex = game.playerOrder.indexOf(game.defenderId);
          const nextAttackerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
          updateTurn(game, nextAttackerIndex);
        }
      }
      broadcastGameState(game.id);
    }
    player.isThinking = false;
  }, delay);
}

export {
  init,
  addPlayerToGame,
  logEvent,
  startGame,
  refillHands,
  updateStatsAfterGame,
  broadcastGameState,
  broadcastPublicLobbies,
  stopTurnTimer,
  startTurnTimer,
  handleTurnTimeout,
  processBotTurn,
  handlePlayerDisconnect
};

export default {
  init,
  addPlayerToGame,
  logEvent,
  startGame,
  refillHands,
  updateStatsAfterGame,
  broadcastGameState,
  broadcastPublicLobbies,
  stopTurnTimer,
  startTurnTimer,
  handleTurnTimeout,
  processBotTurn,
  handlePlayerDisconnect
};
