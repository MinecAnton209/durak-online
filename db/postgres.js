const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
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