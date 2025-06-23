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

    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error("Не вдалося отримати інформацію про таблицю users:", err.message);
            return;
        }
        const hasCardBackColumn = columns.some(col => col.name === 'card_back_style');
        if (!hasCardBackColumn) {
            db.run(`ALTER TABLE users ADD COLUMN card_back_style TEXT DEFAULT 'default'`, (alterErr) => {
                if (alterErr) { console.error('Помилка додавання колонки card_back_style:', alterErr.message); }
                else { console.log('Колонка card_back_style успішно додана в таблицю users.'); }
            });
        } else {
            console.log('Колонка card_back_style вже існує.');
        }
    });

    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error("Не вдалося отримати інформацію про таблицю users:", err.message);
            return;
        }
        const hasVerifiedColumn = columns.some(col => col.name === 'is_verified');
        if (!hasVerifiedColumn) {
            db.run(`ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE`, (alterErr) => {
                if (alterErr) {
                    console.error('Помилка додавання колонки is_verified:', alterErr.message);
                } else {
                    console.log('Колонка is_verified успішно додана в таблицю users.');
                }
            });
        } else {
            console.log('Колонка is_verified вже існує.');
        }
    });
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) return console.error("Не вдалося отримати інформацію про таблицю users:", err.message);
        
        const hasWinStreakColumn = columns.some(col => col.name === 'win_streak');
        if (!hasWinStreakColumn) {
            db.run(`ALTER TABLE users ADD COLUMN win_streak INTEGER DEFAULT 0`, (alterErr) => {
                if (alterErr) {
                    console.error('Помилка додавання колонки win_streak:', alterErr.message);
                } else {
                    console.log('Колонка win_streak успішно додана в таблицю users.');
                }
            });
        }
    });
    db.run(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error("Не вдалося отримати інформацію про таблицю users:", err.message);
            return;
        }
        const hasIsAdminColumn = columns && columns.some(col => col.name === 'is_admin');
        if (!hasIsAdminColumn) {
            db.run(`ALTER TABLE users
                ADD COLUMN is_admin BOOLEAN DEFAULT FALSE`, (alterErr) => {
                if (alterErr) {
                    console.error('Помилка додавання колонки is_admin:', alterErr.message);
                } else {
                    console.log('Колонка is_admin успішно додана в таблицю users.');
                }
            });
        } else {
            console.log('Колонка is_admin вже існує.');
        }
    })
    db.run(`
        CREATE TABLE IF NOT EXISTS achievements (
            code TEXT PRIMARY KEY,
            name_key TEXT NOT NULL,
            description_key TEXT NOT NULL,
            rarity TEXT NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error('Помилка створення таблиці "achievements" в SQLite', err.message);
        } else {
            console.log('Таблиця "achievements" в SQLite готова.');
        }
    });
    
    db.run(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            user_id INTEGER NOT NULL,
            achievement_code TEXT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, achievement_code),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (achievement_code) REFERENCES achievements(code) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Помилка створення таблиці "user_achievements" в SQLite', err.message);
        } else {
            console.log('Таблиця "user_achievements" в SQLite готова.');
        }
    });
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) return console.error("Не вдалося отримати інформацію про таблицю users:", err.message);

        const hasIsBannedColumn = columns && columns.some(col => col.name === 'is_banned');
        if (!hasIsBannedColumn) {
            db.run(`ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT FALSE`, (alterErr) => {
                if (alterErr) console.error('Помилка додавання колонки is_banned:', alterErr.message);
                else console.log('Колонка is_banned успішно додана в таблицю users.');
            });
        }

        const hasBanReasonColumn = columns && columns.some(col => col.name === 'ban_reason');
        if (!hasBanReasonColumn) {
            db.run(`ALTER TABLE users ADD COLUMN ban_reason TEXT`, (alterErr) => {
                if (alterErr) console.error('Помилка додавання колонки ban_reason:', alterErr.message);
                else console.log('Колонка ban_reason успішно додана в таблицю users.');
            });
        }
    });
});

module.exports = db;