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
                                         is_muted BOOLEAN DEFAULT FALSE,
                                         created_at TIMESTAMPTZ DEFAULT NOW()
        );
`).then(() => console.log('Таблиця "users" в PostgreSQL готова до роботи з повною структурою.'))
    .catch(err => console.error('Помилка створення/оновлення таблиці "users" в PostgreSQL:', err.stack));
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

    function formatSql(sql) {
        let i = 0;
        return sql.replace(/\?/g, () => `$${++i}`);
    }

module.exports = {
    run: (sql, params, callback) => {
        pool.query(formatSql(sql), params, (err, res) => callback(err));
    },
    get: (sql, params, callback) => {
        pool.query(formatSql(sql), params, (err, res) => callback(err, res ? res.rows[0] : null));
    },
    all: (sql, params, callback) => {
        pool.query(formatSql(sql), params, (err, res) => callback(err, res ? res.rows : []));
    },
    pool: pool
};