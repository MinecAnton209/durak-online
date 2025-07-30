const db = require('../db');

function incrementDailyCounter(counterName) {
    const today = new Date().toISOString().slice(0, 10);

    const dbClient = process.env.DB_CLIENT || 'sqlite';
    let sql;

    if (dbClient === 'postgres') {
        sql = `
            INSERT INTO system_stats_daily (date, ${counterName})
            VALUES ($1, 1)
            ON CONFLICT (date) DO UPDATE
            SET ${counterName} = system_stats_daily.${counterName} + 1;
        `;
    } else {
        sql = `
            INSERT INTO system_stats_daily (date, ${counterName})
            VALUES (?, 1)
            ON CONFLICT(date) DO UPDATE
            SET ${counterName} = ${counterName} + 1;
        `;
    }

    db.run(sql, [today], (err) => {
        if (err) {
            console.error(`Помилка оновлення лічильника ${counterName}:`, err.message);
        }
    });
}

module.exports = {
    incrementDailyCounter,
};