CREATE TABLE "Achievement" (
	"code" varchar(128) PRIMARY KEY NOT NULL,
	"name_key" varchar(255) NOT NULL,
	"description_key" varchar(255) NOT NULL,
	"rarity" varchar(32) DEFAULT 'common' NOT NULL,
	"icon_url" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "ActiveSession" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_info" varchar(1024),
	"ip_address" varchar(64),
	"location" varchar(255),
	"last_active" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AdminAuditLog" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"admin_id" integer NOT NULL,
	"admin_username" varchar(255) NOT NULL,
	"action_type" varchar(64) NOT NULL,
	"target_user_id" integer,
	"target_username" varchar(255),
	"reason" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "BannedDevice" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" varchar(512) NOT NULL,
	"reason" varchar(512),
	"admin_id" integer,
	"ban_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "BannedDevice_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "ChatFilter" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(32) NOT NULL,
	"content" varchar(512) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChatMessage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" varchar(255),
	"content" varchar(2048),
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Donation" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"telegram_payment_charge_id" varchar(255),
	"amount" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Friend" (
	"id" serial PRIMARY KEY NOT NULL,
	"user1_id" integer NOT NULL,
	"user2_id" integer NOT NULL,
	"action_user_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Game" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"start_time" varchar(64) NOT NULL,
	"end_time" varchar(64),
	"duration_seconds" integer,
	"game_type" varchar(64),
	"winner_user_id" integer,
	"loser_user_id" integer,
	"host_user_id" integer,
	"is_bot_game" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'waiting' NOT NULL,
	"lobby_type" varchar(32) DEFAULT 'public' NOT NULL,
	"invite_code" varchar(64),
	"max_players" integer DEFAULT 2 NOT NULL,
	"game_settings" varchar(2048),
	CONSTRAINT "Game_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "GameParticipant" (
	"game_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"outcome" varchar(32),
	"cards_at_end" integer,
	"is_first_attacker" boolean DEFAULT false NOT NULL,
	"cards_taken_total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "GameParticipant_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "InboxMessage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(32) DEFAULT 'system' NOT NULL,
	"title_key" varchar(255),
	"content_key" varchar(255) NOT NULL,
	"content_params" varchar(1024),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"telegram_message_id" integer
);
--> statement-breakpoint
CREATE TABLE "KnownDevice" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_agent" varchar(1024),
	"parsed_os" varchar(128),
	"parsed_browser" varchar(128),
	"device_model" varchar(255),
	"platform_version" varchar(128),
	"is_mobile" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"login_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"bio" varchar(1024) DEFAULT '' NOT NULL,
	"avatar_id" varchar(64) DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "PushSubscription" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" varchar(1024) NOT NULL,
	"keys" varchar(1024) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PushSubscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "SystemStatsDaily" (
	"date" varchar(32) PRIMARY KEY NOT NULL,
	"new_registrations" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"streak_count" integer DEFAULT 0 NOT NULL,
	"last_played_date" varchar(64),
	"card_back_style" varchar(64) DEFAULT 'default' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_reason" varchar(512),
	"ban_until" timestamp,
	"is_muted" boolean DEFAULT false NOT NULL,
	"mute_until" timestamp,
	"rating" double precision DEFAULT 0 NOT NULL,
	"rd" double precision DEFAULT 350 NOT NULL,
	"vol" double precision DEFAULT 0.06 NOT NULL,
	"last_game_timestamp" varchar(64),
	"telegram_id" varchar(255),
	"is_shadow_banned" boolean DEFAULT false NOT NULL,
	"pref_quick_deck_size" integer DEFAULT 36 NOT NULL,
	"pref_quick_max_players" integer DEFAULT 2 NOT NULL,
	"pref_quick_game_mode" varchar(64) DEFAULT 'podkidnoy' NOT NULL,
	"pref_quick_is_betting" boolean DEFAULT false NOT NULL,
	"pref_quick_bet_amount" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"coins" integer DEFAULT 1000 NOT NULL,
	"last_daily_bonus_claim" timestamp,
	"device_id" varchar(512),
	CONSTRAINT "User_username_unique" UNIQUE("username"),
	CONSTRAINT "User_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "UserAchievement" (
	"user_id" integer NOT NULL,
	"achievement_code" varchar(128) NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UserAchievement_user_id_achievement_code_pk" PRIMARY KEY("user_id","achievement_code")
);
--> statement-breakpoint
CREATE TABLE "UserDevice" (
	"user_id" integer NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"last_used" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UserDevice_user_id_device_id_pk" PRIMARY KEY("user_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "ActiveSession" ADD CONSTRAINT "ActiveSession_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_admin_id_User_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_target_user_id_User_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_user1_id_User_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_user2_id_User_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_action_user_id_User_id_fk" FOREIGN KEY ("action_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_game_id_Game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."Game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievement_code_Achievement_code_fk" FOREIGN KEY ("achievement_code") REFERENCES "public"."Achievement"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_device_id_KnownDevice_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."KnownDevice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "Friend_user1_user2_key" ON "Friend" USING btree ("user1_id","user2_id");