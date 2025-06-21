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