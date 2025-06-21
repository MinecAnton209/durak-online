const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        return console.error('Помилка відкриття SQLite', err.message);
    }
    console.log('Використовується база даних SQLite.');

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            streak_count INTEGER DEFAULT 0,
            last_played_date TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Помилка створення таблиці "users" в SQLite', err.message);
        }
    });

    db.all(`PRAGMA table_info(users)`, (err, columns) => { // **ЗМІНЕНО**: db.get -> db.all
        if (err) {
            console.error("Не вдалося отримати інформацію про таблицю users:", err.message);
            return;
        }

        // Тепер 'columns' - це гарантовано масив
        const hasColumn = columns.some(col => col.name === 'card_back_style');

        if (!hasColumn) {
            db.run(`ALTER TABLE users ADD COLUMN card_back_style TEXT DEFAULT 'default'`, (alterErr) => {
                if (alterErr) {
                    console.error('Помилка додавання колонки card_back_style:', alterErr.message);
                } else {
                    console.log('Колонка card_back_style успішно додана в таблицю users.');
                }
            });
        } else {
            console.log('Колонка card_back_style вже існує.');
        }
    });
});

module.exports = db;