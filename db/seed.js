const fs = require('fs');
const path = require('path');
const db = require('./index.js');

function seedAchievements() {
    const achievementsPath = path.join(__dirname, '../data/achievements.json');
    let achievementsData;

    try {
        const fileContent = fs.readFileSync(achievementsPath, 'utf8');
        achievementsData = JSON.parse(fileContent);
    } catch (error) {
        console.error('Помилка читання або парсингу achievements.json:', error);
        return;
    }

    if (!achievementsData || achievementsData.length === 0) {
        console.log('Файл achievements.json порожній. Пропускаємо посів.');
        return;
    }

    db.run('BEGIN TRANSACTION', [], (err) => {
        if (err) return console.error('Не вдалося почати транзакцію:', err.message);

        const sql = `
            INSERT INTO achievements (code, name_key, description_key, rarity) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                name_key=excluded.name_key,
                description_key=excluded.description_key,
                rarity=excluded.rarity;
        `;

        let completed = 0;
        achievementsData.forEach(ach => {
            const params = [ach.code, ach.name_key, ach.description_key, ach.rarity];
            db.run(sql, params, function(err) {
                if (err) {
                    console.error(`Помилка вставки ачівки ${ach.code}:`, err.message);
                }
                completed++;
                if (completed === achievementsData.length) {
                    db.run('COMMIT', [], (commitErr) => {
                        if (commitErr) {
                            return console.error('Не вдалося зафіксувати транзакцію:', commitErr.message);
                        }
                        console.log(`✅ Успішно завантажено/оновлено ${achievementsData.length} ачівок.`);
                    });
                }
            });
        });
    });
}

module.exports = { seedAchievements };