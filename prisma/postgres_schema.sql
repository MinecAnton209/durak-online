-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "streak_count" INTEGER NOT NULL DEFAULT 0,
    "last_played_date" TEXT,
    "card_back_style" TEXT NOT NULL DEFAULT 'default',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "win_streak" INTEGER NOT NULL DEFAULT 0,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "ban_until" TIMESTAMP(3),
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "mute_until" TIMESTAMP(3),
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500.0,
    "rd" DOUBLE PRECISION NOT NULL DEFAULT 350.0,
    "vol" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "last_game_timestamp" TEXT,
    "telegram_id" TEXT,
    "is_shadow_banned" BOOLEAN NOT NULL DEFAULT false,
    "pref_quick_deck_size" INTEGER NOT NULL DEFAULT 36,
    "pref_quick_max_players" INTEGER NOT NULL DEFAULT 2,
    "pref_quick_game_mode" TEXT NOT NULL DEFAULT 'podkidnoy',
    "pref_quick_is_betting" BOOLEAN NOT NULL DEFAULT false,
    "pref_quick_bet_amount" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coins" INTEGER NOT NULL DEFAULT 1000,
    "last_daily_bonus_claim" TIMESTAMP(3),
    "device_id" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatFilter" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "code" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "description_key" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "icon_url" TEXT,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "user_id" INTEGER NOT NULL,
    "achievement_code" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("user_id","achievement_code")
);

-- CreateTable
CREATE TABLE "BannedDevice" (
    "id" SERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "reason" TEXT,
    "admin_id" INTEGER,
    "ban_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "username" TEXT,
    "content" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "duration_seconds" INTEGER,
    "game_type" TEXT,
    "winner_user_id" INTEGER,
    "loser_user_id" INTEGER,
    "host_user_id" INTEGER,
    "is_bot_game" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "lobby_type" TEXT NOT NULL DEFAULT 'public',
    "invite_code" TEXT,
    "max_players" INTEGER NOT NULL DEFAULT 2,
    "game_settings" TEXT,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "game_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "cards_at_end" INTEGER,
    "is_first_attacker" BOOLEAN NOT NULL DEFAULT false,
    "cards_taken_total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("game_id","user_id")
);

-- CreateTable
CREATE TABLE "SystemStatsDaily" (
    "date" TEXT NOT NULL,
    "new_registrations" INTEGER NOT NULL DEFAULT 0,
    "games_played" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SystemStatsDaily_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_id" INTEGER NOT NULL,
    "admin_username" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_user_id" INTEGER,
    "target_username" TEXT,
    "reason" TEXT,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friend" (
    "id" SERIAL NOT NULL,
    "user1_id" INTEGER NOT NULL,
    "user2_id" INTEGER NOT NULL,
    "action_user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "telegram_payment_charge_id" TEXT,
    "amount" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveSession" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "location" TEXT,
    "last_active" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "user_agent" TEXT,
    "parsed_os" TEXT,
    "parsed_browser" TEXT,
    "device_model" TEXT,
    "platform_version" TEXT,
    "is_mobile" BOOLEAN NOT NULL DEFAULT false,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "login_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "last_used" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("user_id","device_id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',
    "title_key" TEXT,
    "content_key" TEXT NOT NULL,
    "content_params" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telegram_message_id" INTEGER,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegram_id_key" ON "User"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "BannedDevice_device_id_key" ON "BannedDevice"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "Game_invite_code_key" ON "Game"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "Friend_user1_id_user2_id_key" ON "Friend"("user1_id", "user2_id");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievement_code_fkey" FOREIGN KEY ("achievement_code") REFERENCES "Achievement"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_action_user_id_fkey" FOREIGN KEY ("action_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveSession" ADD CONSTRAINT "ActiveSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "KnownDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

