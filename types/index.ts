import type { InferSelectModel } from 'drizzle-orm';
import type { Server as SocketIOServer, Socket as IOSocket } from 'socket.io';
import type * as schema from '../db/schema.js';

export type User = InferSelectModel<typeof schema.user>;
export type SessionUser = {
  id: number;
  username: string;
  password?: string;
  wins: number;
  losses: number;
  streak_count: number;
  last_played_date: string | null;
  card_back_style: string;
  is_verified: boolean;
  win_streak: number;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  ban_until: Date | null;
  is_muted: boolean;
  mute_until: Date | null;
  rating: number;
  rd: number;
  vol: number;
  last_game_timestamp: string | null;
  telegram_id: string | null;
  is_shadow_banned: boolean;
  pref_quick_deck_size: number;
  pref_quick_max_players: number;
  pref_quick_game_mode: string;
  pref_quick_is_betting: boolean;
  pref_quick_bet_amount: number;
  created_at: Date;
  coins: number;
  last_daily_bonus_claim: Date | null;
  device_id: string | null;
  sessionId: string;
};
export type Game = InferSelectModel<typeof schema.game>;
export type GameParticipant = InferSelectModel<typeof schema.gameParticipant>;
export type Achievement = InferSelectModel<typeof schema.achievement>;

export interface Card {
  suit: string;
  rank: string;
}

export interface Player {
  id: string;
  dbId: number | null;
  deviceId?: string;
  name: string;
  isGuest: boolean;
  cardBackStyle: string;
  streak: number;
  rating: number;
  isVerified: boolean;
  is_muted: boolean;
  cards: Card[];
  gameStats: { cardsTaken: number; successfulDefenses: number; cardsBeatenInDefense: number };
  afkStrikes: number;
  isBot?: boolean;
  difficulty?: 'child' | 'beginner' | 'easy' | 'medium' | 'hard' | 'impossible';
  isThinking?: boolean;
  disconnected?: boolean;
  disconnectTime?: number;
  reconnectTimeout?: NodeJS.Timeout | null;
  turnTimer?: NodeJS.Timeout | null;
  turnDeadline?: number | null;
  lastAction?: string;
  bank?: number;
  isStatsUpdating?: boolean;
}

export interface GameSettings {
  maxPlayers: number;
  deckSize: number;
  turnDuration: number;
  gameMode: string;
  isBetting: boolean;
  betAmount: number;
  lobbyType?: 'public' | 'private';
}

export interface LogEntry {
  timestamp: string;
  message?: string;
  i18nKey?: string;
  options?: Record<string, unknown>;
  author?: { name: string; isVerified: boolean };
}

export interface GameState {
  id: string;
  status: 'waiting' | 'in_progress' | 'finished' | 'cancelled';
  players: Record<string, Player>;
  playerOrder: string[];
  hostId: string;
  settings: GameSettings;
  deck: Card[];
  attackerId: string | null;
  defenderId: string | null;
  table: Card[];
  discardPile: Card[];
  pile: Card[];
  dealEndsAt?: number;
  turnEndsAt?: number;
  turn: string | null;
  winner: { winners: Player[]; loser: Player | null; reason?: { i18nKey: string; options: Record<string, unknown> } } | null;
  bank?: number;
  startTime?: Date;
  trumpSuit?: string | null;
  trumpCard?: Card | null;
  spectators?: string[];
  log?: LogEntry[];
  lastAction?: string | null;
  musicState: {
    currentTrackId: string | null;
    isPlaying: boolean;
    trackTitle: string;
    suggester: string | null;
    stateChangeTimestamp: number | null;
    seekTimestamp: number;
  };
}

export function getGame(games: Record<string, GameState>, gameId: string): GameState | undefined {
  return games[gameId];
}

export interface SocketData {
  userId?: number;
  sessionId?: string;
}

export type TypedSocket = IOSocket<SocketData>;
export type TypedServer = SocketIOServer<SocketData>;
