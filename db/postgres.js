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
        id SERIAL PRIMARY KEY,fw
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        streak_count INTEGER DEFAULT 0,
        last_played_date DATE
    );
`).then(() => console.log('Таблиця "users" в PostgreSQL готова до роботи.'))
    .catch(err => console.error('Помилка створення таблиці "users" в PostgreSQL:', err));

pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
    )
    WITH (OIDS=FALSE);
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
`).then(() => console.log('Таблиця "user_sessions" готова до роботи.'))
    .catch(err => console.error('Помилка створення таблиці "user_sessions":', err));

pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS(SELECT *
                FROM information_schema.columns
                WHERE table_name='users' and column_name='card_back_style')
            THEN
                ALTER TABLE "users" ADD COLUMN card_back_style TEXT DEFAULT 'default';
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