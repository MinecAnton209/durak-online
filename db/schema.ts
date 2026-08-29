import { pgTable, serial, varchar, integer, boolean, doublePrecision, timestamp, primaryKey, uniqueIndex, foreignKey, pgEnum } from 'drizzle-orm/pg-core';

const timestampOpts = { mode: 'date' };

export const user = pgTable('User', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  streak_count: integer('streak_count').notNull().default(0),
  last_played_date: varchar('last_played_date', { length: 64 }),
  card_back_style: varchar('card_back_style', { length: 64 }).notNull().default('default'),
  is_verified: boolean('is_verified').notNull().default(false),
  win_streak: integer('win_streak').notNull().default(0),
  is_admin: boolean('is_admin').notNull().default(false),
  is_banned: boolean('is_banned').notNull().default(false),
  ban_reason: varchar('ban_reason', { length: 512 }),
  ban_until: timestamp('ban_until', timestampOpts),
  is_muted: boolean('is_muted').notNull().default(false),
  mute_until: timestamp('mute_until', timestampOpts),
  rating: doublePrecision('rating').notNull().default(0.0),
  rd: doublePrecision('rd').notNull().default(350.0),
  vol: doublePrecision('vol').notNull().default(0.06),
  last_game_timestamp: varchar('last_game_timestamp', { length: 64 }),
  telegram_id: varchar('telegram_id', { length: 255 }).unique(),
  is_shadow_banned: boolean('is_shadow_banned').notNull().default(false),
  pref_quick_deck_size: integer('pref_quick_deck_size').notNull().default(36),
  pref_quick_max_players: integer('pref_quick_max_players').notNull().default(2),
  pref_quick_game_mode: varchar('pref_quick_game_mode', { length: 64 }).notNull().default('podkidnoy'),
  pref_quick_is_betting: boolean('pref_quick_is_betting').notNull().default(false),
  pref_quick_bet_amount: integer('pref_quick_bet_amount').notNull().default(10),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
  coins: integer('coins').notNull().default(1000),
  last_daily_bonus_claim: timestamp('last_daily_bonus_claim', timestampOpts),
  device_id: varchar('device_id', { length: 512 }),
});

export const chatFilter = pgTable('ChatFilter', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 32 }).notNull(),
  content: varchar('content', { length: 512 }).notNull(),
  is_enabled: boolean('is_enabled').notNull().default(true),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const achievement = pgTable('Achievement', {
  code: varchar('code', { length: 128 }).primaryKey(),
  name_key: varchar('name_key', { length: 255 }).notNull(),
  description_key: varchar('description_key', { length: 255 }).notNull(),
  rarity: varchar('rarity', { length: 32 }).notNull().default('common'),
  icon_url: varchar('icon_url', { length: 512 }),
});

export const userAchievement = pgTable(
  'UserAchievement',
  {
    user_id: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    achievement_code: varchar('achievement_code', { length: 128 })
      .notNull()
      .references(() => achievement.code, { onDelete: 'cascade' }),
    unlocked_at: timestamp('unlocked_at', timestampOpts).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.achievement_code] }),
  })
);

export const bannedDevice = pgTable('BannedDevice', {
  id: serial('id').primaryKey(),
  device_id: varchar('device_id', { length: 512 }).notNull().unique(),
  reason: varchar('reason', { length: 512 }),
  admin_id: integer('admin_id'),
  ban_until: timestamp('ban_until', timestampOpts),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const chatMessage = pgTable('ChatMessage', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id'),
  username: varchar('username', { length: 255 }),
  content: varchar('content', { length: 2048 }),
  is_deleted: boolean('is_deleted').notNull().default(false),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const game = pgTable('Game', {
  id: varchar('id', { length: 64 }).primaryKey(),
  start_time: varchar('start_time', { length: 64 }).notNull(),
  end_time: varchar('end_time', { length: 64 }),
  duration_seconds: integer('duration_seconds'),
  game_type: varchar('game_type', { length: 64 }),
  winner_user_id: integer('winner_user_id'),
  loser_user_id: integer('loser_user_id'),
  host_user_id: integer('host_user_id'),
  is_bot_game: boolean('is_bot_game').notNull().default(false),
  status: varchar('status', { length: 32 }).notNull().default('waiting'),
  lobby_type: varchar('lobby_type', { length: 32 }).notNull().default('public'),
  invite_code: varchar('invite_code', { length: 64 }).unique(),
  max_players: integer('max_players').notNull().default(2),
  game_settings: varchar('game_settings', { length: 2048 }),
});

export const gameParticipant = pgTable(
  'GameParticipant',
  {
    game_id: varchar('game_id', { length: 64 })
      .notNull()
      .references(() => game.id, { onDelete: 'cascade' }),
    user_id: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    is_bot: boolean('is_bot').notNull().default(false),
    outcome: varchar('outcome', { length: 32 }),
    cards_at_end: integer('cards_at_end'),
    is_first_attacker: boolean('is_first_attacker').notNull().default(false),
    cards_taken_total: integer('cards_taken_total').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.game_id, t.user_id] }),
  })
);

export const systemStatsDaily = pgTable('SystemStatsDaily', {
  date: varchar('date', { length: 32 }).primaryKey(),
  new_registrations: integer('new_registrations').notNull().default(0),
  games_played: integer('games_played').notNull().default(0),
});

export const adminAuditLog = pgTable('AdminAuditLog', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp', timestampOpts).notNull().defaultNow(),
  admin_id: integer('admin_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  admin_username: varchar('admin_username', { length: 255 }).notNull(),
  action_type: varchar('action_type', { length: 64 }).notNull(),
  target_user_id: integer('target_user_id').references(() => user.id, { onDelete: 'set null' }),
  target_username: varchar('target_username', { length: 255 }),
  reason: varchar('reason', { length: 512 }),
});

export const friend = pgTable(
  'Friend',
  {
    id: serial('id').primaryKey(),
    user1_id: integer('user1_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    user2_id: integer('user2_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    action_user_id: integer('action_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
    updated_at: timestamp('updated_at', timestampOpts).notNull().defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex('Friend_user1_user2_key').on(t.user1_id, t.user2_id),
  })
);

export const pushSubscription = pgTable('PushSubscription', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  endpoint: varchar('endpoint', { length: 1024 }).notNull().unique(),
  keys: varchar('keys', { length: 1024 }).notNull(),
  updated_at: timestamp('updated_at', timestampOpts).notNull().defaultNow(),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const donation = pgTable('Donation', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => user.id, { onDelete: 'set null' }),
  telegram_payment_charge_id: varchar('telegram_payment_charge_id', { length: 255 }),
  amount: integer('amount'),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const activeSession = pgTable('ActiveSession', {
  id: varchar('id', { length: 128 }).primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  device_info: varchar('device_info', { length: 1024 }),
  ip_address: varchar('ip_address', { length: 64 }),
  location: varchar('location', { length: 255 }),
  last_active: timestamp('last_active', timestampOpts).notNull().defaultNow(),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const knownDevice = pgTable('KnownDevice', {
  id: varchar('id', { length: 128 }).primaryKey(),
  user_agent: varchar('user_agent', { length: 1024 }),
  parsed_os: varchar('parsed_os', { length: 128 }),
  parsed_browser: varchar('parsed_browser', { length: 128 }),
  device_model: varchar('device_model', { length: 255 }),
  platform_version: varchar('platform_version', { length: 128 }),
  is_mobile: boolean('is_mobile').notNull().default(false),
  first_seen: timestamp('first_seen', timestampOpts).notNull().defaultNow(),
  last_seen: timestamp('last_seen', timestampOpts).notNull().defaultNow(),
  login_count: integer('login_count').notNull().default(1),
});

export const userDevice = pgTable(
  'UserDevice',
  {
    user_id: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    device_id: varchar('device_id', { length: 128 })
      .notNull()
      .references(() => knownDevice.id, { onDelete: 'cascade' }),
    last_used: timestamp('last_used', timestampOpts).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.device_id] }),
  })
);

export const inboxMessage = pgTable('InboxMessage', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull().default('system'),
  title_key: varchar('title_key', { length: 255 }),
  content_key: varchar('content_key', { length: 255 }).notNull(),
  content_params: varchar('content_params', { length: 1024 }),
  is_read: boolean('is_read').notNull().default(false),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
  telegram_message_id: integer('telegram_message_id'),
});

export const profile = pgTable('Profile', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  bio: varchar('bio', { length: 1024 }).notNull().default(''),
  avatar_id: varchar('avatar_id', { length: 64 }).notNull().default('default'),
  created_at: timestamp('created_at', timestampOpts).notNull().defaultNow(),
});

export const schema = {
  user,
  chatFilter,
  achievement,
  userAchievement,
  bannedDevice,
  chatMessage,
  game,
  gameParticipant,
  systemStatsDaily,
  adminAuditLog,
  friend,
  pushSubscription,
  donation,
  activeSession,
  knownDevice,
  userDevice,
  inboxMessage,
  profile,
};
