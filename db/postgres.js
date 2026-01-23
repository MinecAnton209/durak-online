const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    host: new URL(process.env.DATABASE_URL).hostname
});

console.log('Використовується база даних PostgreSQL.');

pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username text UNIQUE NOT NULL,
        password text NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        streak_count INTEGER DEFAULT 0,
        last_played_date DATE,
        card_back_style text DEFAULT 'default',
        is_verified BOOLEAN DEFAULT FALSE,
        win_streak INTEGER DEFAULT 0,
        is_admin BOOLEAN DEFAULT FALSE,
        is_banned BOOLEAN DEFAULT FALSE,
        ban_reason text,
        ban_until TIMESTAMPTZ,
        is_muted BOOLEAN DEFAULT FALSE,
        mute_until TIMESTAMPTZ,
        rating DOUBLE PRECISION DEFAULT 1500.0,
        rd DOUBLE PRECISION DEFAULT 350.0,
        vol DOUBLE PRECISION DEFAULT 0.06,
        last_game_timestamp TIMESTAMPTZ,
        telegram_id text UNIQUE,
        is_shadow_banned BOOLEAN DEFAULT FALSE,
        pref_quick_deck_size INTEGER DEFAULT 36,
        pref_quick_max_players INTEGER DEFAULT 2,
        pref_quick_game_mode text DEFAULT 'podkidnoy',
        pref_quick_is_betting BOOLEAN DEFAULT FALSE,
        pref_quick_bet_amount INTEGER DEFAULT 10,
        created_at TIMESTAMPTZ DEFAULT NOW()
        );
`).then(() => console.log('Таблиця "users" в PostgreSQL готова до роботи з повною структурою.'))
    .catch(err => console.error('Помилка створення/оновлення таблиці "users" в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS chat_filters (
        id SERIAL PRIMARY KEY,
        type text NOT NULL, -- 'word' or 'regex'
        content text NOT NULL,
        is_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "chat_filters" створена.'))
    .catch(err => console.error('Помилка створ. "chat_filters":', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS banned_devices (
        id SERIAL PRIMARY KEY,
        device_id text UNIQUE NOT NULL,
        reason text,
        admin_id INTEGER,
        ban_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "banned_devices" створена.'))
    .catch(err => console.error('Помилка створ. "banned_devices":', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        username text,
        content text,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "chat_messages" створена.'))
    .catch(err => console.error('Помилка створ. "chat_messages":', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
                                                   "sid" varchar NOT NULL COLLATE "default",
                                                   "sess" json NOT NULL,
                                                   "expire" timestamp(6) NOT NULL,
        CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
        )
        WITH (OIDS=FALSE);
`).then(() => console.log('Таблиця "user_sessions" в PostgreSQL готова до роботи.'))
    .catch(err => {
        if (err.code !== '42P07') {
            console.error('Помилка створення таблиці "user_sessions":', err.stack);
        }
    });

pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT *
                FROM information_schema.columns
                WHERE table_name='users' and column_name='card_back_style')
            THEN
                ALTER TABLE "users" ADD COLUMN card_back_style text DEFAULT 'default';
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонки card_back_style.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки card_back_style:', err));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='is_verified')
        THEN
            ALTER TABLE "users" ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонки is_verified.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки is_verified:', err));

pool.query(`
        CREATE TABLE IF NOT EXISTS achievements (
            code TEXT PRIMARY KEY,
            name_key TEXT NOT NULL,
            description_key TEXT NOT NULL,
            rarity TEXT NOT NULL
        );
    `).then(() => console.log('Таблиця "achievements" в PostgreSQL готова до роботи.'))
    .catch(err => console.error('Помилка створення таблиці "achievements" в PostgreSQL:', err.stack));

pool.query(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            user_id INTEGER NOT NULL,
            achievement_code TEXT NOT NULL,
            unlocked_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (user_id, achievement_code),
            CONSTRAINT fk_user
                FOREIGN KEY(user_id) 
                REFERENCES users(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_achievement
                FOREIGN KEY(achievement_code) 
                REFERENCES achievements(code)
                ON DELETE CASCADE
        );
    `).then(() => console.log('Таблиця "user_achievements" в PostgreSQL готова до роботи.'))
    .catch(err => console.error('Помилка створення таблиці "user_achievements" в PostgreSQL:', err.stack));
pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='win_streak')
            THEN
                ALTER TABLE "users" ADD COLUMN win_streak INTEGER DEFAULT 0;
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонки win_streak.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки win_streak:', err));

pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='is_admin')
            THEN
                ALTER TABLE "users" ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонки is_admin в PostgreSQL.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки is_admin в PostgreSQL:', err.stack));
pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='is_banned')
            THEN
                ALTER TABLE "users" ADD COLUMN is_banned BOOLEAN DEFAULT FALSE;
            END IF;
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='ban_reason')
            THEN
                ALTER TABLE "users" ADD COLUMN ban_reason text;
            END IF;
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='ban_until')
            THEN
                ALTER TABLE "users" ADD COLUMN ban_until TIMESTAMPTZ;
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонок is_banned та ban_reason в PostgreSQL.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонок is_banned/ban_reason в PostgreSQL:', err.stack));
pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='is_muted')
            THEN
                ALTER TABLE "users" ADD COLUMN is_muted BOOLEAN DEFAULT FALSE;
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонки is_muted в PostgreSQL.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки is_muted в PostgreSQL:', err.stack));

pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='mute_until')
            THEN
                ALTER TABLE "users" ADD COLUMN mute_until TIMESTAMPTZ;
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонки mute_until в PostgreSQL.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки mute_until в PostgreSQL:', err.stack));

pool.query(`
        CREATE TABLE IF NOT EXISTS games_history (
            id SERIAL PRIMARY KEY,
            game_id TEXT UNIQUE,
            start_time TIMESTAMPTZ,
            end_time TIMESTAMPTZ,
            duration_seconds INTEGER,
            players_count INTEGER,
            is_suspicious BOOLEAN DEFAULT FALSE
        );
    `).then(() => console.log('Таблиця "games_history" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "games_history" в PostgreSQL:', err.stack));

pool.query(`
        CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY,
            start_time TIMESTAMPTZ NOT NULL,
            end_time TIMESTAMPTZ,
            duration_seconds INTEGER,
            game_type TEXT,
            winner_user_id INTEGER,
            loser_user_id INTEGER,
            host_user_id INTEGER,
            is_bot_game BOOLEAN DEFAULT FALSE
        );
    `).then(() => console.log('Таблиця "games" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "games" в PostgreSQL:', err.stack));

pool.query(`
        CREATE TABLE IF NOT EXISTS game_participants (
            game_id TEXT NOT NULL,
            user_id INTEGER,
            is_bot BOOLEAN DEFAULT FALSE,
            outcome TEXT,
            cards_at_end INTEGER,
            is_first_attacker BOOLEAN DEFAULT FALSE,
            cards_taken_total INTEGER DEFAULT 0,
            PRIMARY KEY (game_id, user_id),
            CONSTRAINT fk_game FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
            CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    `).then(() => console.log('Таблиця "game_participants" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "game_participants" в PostgreSQL:', err.stack));

pool.query(`
        CREATE TABLE IF NOT EXISTS system_stats_daily (
            date DATE PRIMARY KEY,
            new_registrations INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0
        );
    `).then(() => console.log('Таблиця "system_stats_daily" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "system_stats_daily" в PostgreSQL:', err.stack));

pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='created_at')
            THEN
                ALTER TABLE "users" ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
            END IF;
        END;
        $$;
    `).then(() => console.log('Перевірено наявність колонки created_at в PostgreSQL.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки created_at в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
        id SERIAL PRIMARY KEY,
        "timestamp" TIMESTAMPTZ DEFAULT NOW(),
        admin_id INTEGER NOT NULL,
        admin_username TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_user_id INTEGER,
        target_username TEXT,
        reason TEXT,
        CONSTRAINT fk_admin
            FOREIGN KEY(admin_id) 
            REFERENCES users(id)
            ON DELETE SET NULL,
        CONSTRAINT fk_target_user
            FOREIGN KEY(target_user_id) 
            REFERENCES users(id)
            ON DELETE SET NULL
    );
`).then(() => console.log('Таблиця "admin_audit_log" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "admin_audit_log" в PostgreSQL:', err.stack));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friendship_status') THEN
            CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
        END IF;
    END$$;
`).then(() => console.log('Перевірено наявність типу "friendship_status".'))
    .catch(err => console.error('Помилка при перевірці/створенні типу "friendship_status":', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS friends (
                                           id SERIAL PRIMARY KEY,
                                           user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status friendship_status NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT check_users_not_same CHECK (user1_id <> user2_id)
        );
`).then(() => console.log('Таблиця "friends" в PostgreSQL створена (крок 1).'))
    .catch(err => console.error('Помилка створення таблиці "friends" (крок 1):', err.stack));

pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_user_pair_idx
    ON friends (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
`).then(() => console.log('Унікальний індекс для "friends" створено (крок 2).'))
    .catch(err => console.error('Помилка створення унікального індексу для "friends" (крок 2):', err.stack));

pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
       NEW.updated_at = NOW(); 
       RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS trigger_friends_updated_at ON friends;
    CREATE TRIGGER trigger_friends_updated_at
    BEFORE UPDATE ON friends
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`).then(() => console.log('Тригер "trigger_friends_updated_at" для таблиці friends створено/оновлено.'))
    .catch(err => console.error('Помилка створення тригеру для friends:', err.stack));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='coins')
        THEN
            ALTER TABLE "users" ADD COLUMN coins BIGINT DEFAULT 1000 NOT NULL;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_daily_bonus_claim')
        THEN
            ALTER TABLE "users" ADD COLUMN last_daily_bonus_claim DATE;
        END IF;

        -- Quick Game Preferences
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pref_quick_deck_size') THEN
            ALTER TABLE "users" ADD COLUMN pref_quick_deck_size INTEGER DEFAULT 36;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pref_quick_max_players') THEN
            ALTER TABLE "users" ADD COLUMN pref_quick_max_players INTEGER DEFAULT 2;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pref_quick_game_mode') THEN
            ALTER TABLE "users" ADD COLUMN pref_quick_game_mode TEXT DEFAULT 'podkidnoy';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pref_quick_is_betting') THEN
            ALTER TABLE "users" ADD COLUMN pref_quick_is_betting BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pref_quick_bet_amount') THEN
            ALTER TABLE "users" ADD COLUMN pref_quick_bet_amount INTEGER DEFAULT 10;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонок coins, last_daily_bonus_claim та налаштувань Quick Game в PostgreSQL.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонок coins/last_daily_bonus_claim/quick_prefs:', err.stack));
pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        subscription_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "push_subscriptions" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "push_subscriptions" в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        telegram_payment_charge_id TEXT,
        amount INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "donations" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "donations" в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS active_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_info TEXT,
        ip_address TEXT,
        location TEXT,
        last_active TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "active_sessions" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "active_sessions" в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS known_devices (
        id TEXT PRIMARY KEY,
        user_agent TEXT,
        parsed_os TEXT,
        parsed_browser TEXT,
        device_model TEXT,
        platform_version TEXT,
        is_mobile BOOLEAN DEFAULT FALSE,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        login_count INTEGER DEFAULT 1
    );
`).then(() => console.log('Таблиця "known_devices" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "known_devices" в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS user_devices (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT REFERENCES known_devices(id) ON DELETE CASCADE,
        last_used TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, device_id)
    );
`).then(() => console.log('Таблиця "user_devices" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "user_devices" в PostgreSQL:', err.stack));

pool.query(`
    CREATE TABLE IF NOT EXISTS inbox_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'system',
        title_key TEXT,
        content_key TEXT NOT NULL,
        content_params JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
`).then(() => console.log('Таблиця "inbox_messages" в PostgreSQL готова.'))
    .catch(err => console.error('Помилка створення таблиці "inbox_messages":', err.stack));


pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='telegram_id')
        THEN
            ALTER TABLE "users" ADD COLUMN telegram_id text UNIQUE;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонки telegram_id.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки telegram_id:', err));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='inbox_messages' and column_name='telegram_message_id')
        THEN
            ALTER TABLE "inbox_messages" ADD COLUMN telegram_message_id BIGINT;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонки telegram_message_id в inbox_messages.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки telegram_message_id:', err));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='status') THEN
            ALTER TABLE "games" ADD COLUMN status TEXT DEFAULT 'waiting' NOT NULL;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='lobby_type') THEN
            ALTER TABLE "games" ADD COLUMN lobby_type TEXT DEFAULT 'public' NOT NULL;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='invite_code') THEN
            ALTER TABLE "games" ADD COLUMN invite_code TEXT UNIQUE;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='max_players') THEN
            ALTER TABLE "games" ADD COLUMN max_players INTEGER DEFAULT 2 NOT NULL;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='game_settings') THEN
            ALTER TABLE "games" ADD COLUMN game_settings TEXT;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонок лоббі в таблиці "games" в PostgreSQL.'))
    .catch(err => console.error('Помилка при додаванні колонок лоббі в "games" в PostgreSQL:', err.stack));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='device_id')
        THEN
            ALTER TABLE "users" ADD COLUMN device_id text;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонки device_id.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки device_id:', err));

pool.query(`
    DO $$
    BEGIN
        IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' and column_name='is_shadow_banned')
        THEN
            ALTER TABLE "users" ADD COLUMN is_shadow_banned BOOLEAN DEFAULT FALSE;
        END IF;
    END;
    $$;
`).then(() => console.log('Перевірено наявність колонки is_shadow_banned.'))
    .catch(err => console.error('Помилка при перевірці/додаванні колонки is_shadow_banned:', err));

function formatSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

module.exports = {
    run: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const safeParams = Array.isArray(params) ? params : [];

        const formattedParams = safeParams.map(p => (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p);
        pool.query(formatSql(sql), formattedParams, (err, res) => {
            if (callback) callback(err);
        });
    },
    get: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const safeParams = Array.isArray(params) ? params : [];

        const formattedParams = safeParams.map(p => (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p);
        pool.query(formatSql(sql), formattedParams, (err, res) => {
            if (callback) callback(err, res ? res.rows[0] : null);
        });
    },
    all: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const safeParams = Array.isArray(params) ? params : [];

        const formattedParams = safeParams.map(p => (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p);
        pool.query(formatSql(sql), formattedParams, (err, res) => {
            if (callback) callback(err, res ? res.rows : []);
        });
    },
    pool: pool
};