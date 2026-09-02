import type { SocketData } from './index.js';

export type PokerSuit = '♠' | '♥' | '♦' | '♣';
export type PokerRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: PokerSuit;
  rank: PokerRank;
}

export type PokerGameType = 'poker_holdem_cash' | 'poker_holdem_tournament';

export type BettingRoundName = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  durationMs: number;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
  wonBy?: string | null;
}

export interface PokerPlayer {
  id: string;
  dbId: number | null;
  name: string;
  chips: number;
  cards: Card[];
  currentBet: number;
  totalBet: number;
  folded: boolean;
  isAllIn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isConnected: boolean;
  hasActedThisRound: boolean;
}

export interface PokerGameState {
  id: string;
  gameType: PokerGameType;
  status: 'waiting' | 'in_progress' | 'finished';
  players: Record<string, PokerPlayer>;
  playerOrder: string[];
  dealerBtn: number;
  currentPlayerIdx: number;
  bettingRound: BettingRoundName;
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  deck: Card[];
  tournamentId?: string | null;
  blindStructure?: BlindLevel[];
  currentBlindLevel: number;
  blindTimerEndsAt?: number | null;
  log: Array<{ timestamp: string; message: string }>;
  maxPlayers?: number;
  smallBlind?: number;
  bigBlind?: number;
  startingChips?: number;
}

export interface PokerTournament {
  id: string;
  name: string;
  scheduledAt: Date;
  status: 'pending' | 'running' | 'completed';
  buyIn: number;
  blindStructure: BlindLevel[];
  startedAt?: Date | null;
  endedAt?: Date | null;
}

export interface HandResult {
  rank: number;
  name: string;
  kickers: number[];
}

export interface ShowdownWinner {
  playerId: string;
  handRank: HandResult;
  payout: number;
}

export interface PokerSocketData extends SocketData {
  playerName?: string;
}
