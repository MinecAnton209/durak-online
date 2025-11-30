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
                                                 telegram_id TEXT UNIQUE,
                                                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Помилка створення таблиці "users":', err.message);
            } else {
                console.log('Таблиця "users" готова.');
                runUsersMigrations();
            }
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
        db.run(`
            CREATE TABLE IF NOT EXISTS friends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user1_id INTEGER NOT NULL,
                user2_id INTEGER NOT NULL,
                action_user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'blocked')),
                created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (action_user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE (user1_id, user2_id)
            );
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "friends" в SQLite:', err.message);
            else console.log('Таблиця "friends" в SQLite готова.');
        });
        db.run(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                subscription_data TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "push_subscriptions" в SQLite:', err.message);
            else console.log('Таблиця "push_subscriptions" в SQLite готова.');
        });
        db.run(`
            CREATE TABLE IF NOT EXISTS donations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                telegram_payment_charge_id TEXT,
                amount INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
            );
        `, (err) => {
            if (err) console.error('Помилка створення таблиці "donations" в SQLite:', err.message);
            else console.log('Таблиця "donations" в SQLite готова.');
        });
        db.run(`
            CREATE TRIGGER IF NOT EXISTS trigger_friends_updated_at_sqlite
            AFTER UPDATE ON friends
            FOR EACH ROW
            BEGIN
                UPDATE friends SET updated_at = datetime('now') WHERE id = OLD.id;
            END;
        `, (err) => {
            if (err) console.error('Помилка створення тригеру для "friends" в SQLite:', err.message);
        });
    });
});
function runUsersMigrations() {
    const migrations = [
        { column: 'coins', type: 'INTEGER', options: 'DEFAULT 1000 NOT NULL' },
        { column: 'last_daily_bonus_claim', type: 'DATE', options: '' },
        { column: 'telegram_id', type: 'TEXT', options: '' }
    ];
    db.all(`PRAGMA table_info(users);`, [], (err, columns) => {
        if (err) {
            return console.error("Не вдалося отримати інформацію про таблицю users:", err.message);
        }
        const existingColumns = columns.map(c => c.name);
        migrations.forEach(migration => {
            if (!existingColumns.includes(migration.column)) {
                const sql = `ALTER TABLE users ADD COLUMN ${migration.column} ${migration.type} ${migration.options};`;
                db.run(sql, (alterErr) => {
                    if (alterErr) {
                        console.error(`Помилка додавання колонки '${migration.column}':`, alterErr.message);
                    } else {
                        console.log(`Колонка '${migration.column}' успішно додана в таблицю users.`);

                        if (migration.column === 'telegram_id') {
                            db.run(
                                'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id) WHERE telegram_id IS NOT NULL;',
                                (indexErr) => {
                                    if(indexErr) console.error("Помилка створення UNIQUE індексу для telegram_id:", indexErr.message);
                                    else console.log("UNIQUE індекс для telegram_id створено.");
                                }
                            );
                        }
                    }
                });
            }
        });
    });
}
module.exports = db;
