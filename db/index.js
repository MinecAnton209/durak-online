require('dotenv').config();

let db;

const dbClient = process.env.DB_CLIENT || 'sqlite';

if (dbClient === 'postgres' && process.env.DATABASE_URL) {
    try {
        db = require('./postgres.js');
    } catch (error) {
        console.error("Помилка підключення PostgreSQL драйвера. Переконайтесь, що 'pg' встановлено (`npm install pg`).", error);
        process.exit(1);
    }
} else {
    try {
        db = require('./sqlite.js');
    } catch (error) {
        console.error("Помилка підключення SQLite3 драйвера. Переконайтесь, що 'sqlite3' встановлено (`npm install sqlite3`).", error);
        process.exit(1);
    }
}

module.exports = db;