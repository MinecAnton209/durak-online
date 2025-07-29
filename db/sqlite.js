const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        return console.error('Помилка відкриття SQLite', err.message);
    }
    console.log('Використовується база даних SQLite.');

    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                streak_count INTEGER DEFAULT 0,
                last_played_date TEXT,
                card_back_style TEXT DEFAULT 'default',
                is_verified BOOLEAN DEFAULT FALSE,
                win_streak INTEGER DEFAULT 0,
                is_admin BOOLEAN DEFAULT FALSE,
                is_banned BOOLEAN DEFAULT FALSE,
                ban_reason TEXT,
                is_muted BOOLEAN DEFAULT FALSE,
                rating REAL DEFAULT 1500.0,
                rd REAL DEFAULT 350.0,
                vol REAL DEFAULT 0.06,
                last_game_timestamp TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "users":', err.message);
            else console.log('Таблиця "users" готова.');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS achievements (
                code TEXT PRIMARY KEY,
                name_key TEXT NOT NULL,
                description_key TEXT NOT NULL,
                rarity TEXT NOT NULL
            )
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "achievements":', err.message);
            else console.log('Таблиця "achievements" готова.');
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
            if (err) console.error('Помилка створення таблиці "user_achievements":', err.message);
            else console.log('Таблиця "user_achievements" готова.');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_seconds INTEGER,
                game_type TEXT,
                winner_user_id INTEGER,
                loser_user_id INTEGER,
                host_user_id INTEGER,
                is_bot_game BOOLEAN DEFAULT FALSE
            )
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "games":', err.message);
            else console.log('Таблиця "games" готова.');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS game_participants (
                game_id TEXT NOT NULL,
                user_id INTEGER,
                is_bot BOOLEAN DEFAULT FALSE,
                outcome TEXT,
                cards_at_end INTEGER,
                is_first_attacker BOOLEAN DEFAULT FALSE,
                cards_taken_total INTEGER DEFAULT 0,
                PRIMARY KEY (game_id, user_id),
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "game_participants":', err.message);
            else console.log('Таблиця "game_participants" готова.');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS system_stats_daily (
                date TEXT PRIMARY KEY,
                new_registrations INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0
            )
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "system_stats_daily":', err.message);
            else console.log('Таблиця "system_stats_daily" готова.');
        });
        db.run(`
            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                admin_id INTEGER NOT NULL,
                admin_username TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target_user_id INTEGER,
                target_username TEXT,
                reason TEXT,
                FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
            )
`, (err) => {
            if (err) console.error('Помилка створення таблиці "admin_audit_log" в SQLite', err.message);
            else console.log('Таблиця "admin_audit_log" в SQLite готова.');
        });
    });
});

module.exports = db;