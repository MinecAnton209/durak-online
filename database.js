const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, 'data');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Помилка відкриття бази даних', err.message);
    } else {
        console.log('Успішно підключено до бази даних SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            streak_count INTEGER DEFAULT 0,
            last_played_date TEXT
        )`, (err) => {
            if (err) {
                console.error('Помилка створення таблиці "users"', err.message);
            }
        });
    }
});

module.exports = db;