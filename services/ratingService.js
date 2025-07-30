const { Glicko2 } = require('glicko2');
const db = require('../db');

const MIN_RD = 50;

const settings = {
    tau: 0.5,
    rating: 1500,
    rd: 150,
    vol: 0.1
};

const glicko = new Glicko2(settings);

async function updateRatingsAfterGame(game) {
    if (!game || !game.winner || !game.winner.winners || !game.winner.loser) {
        console.warn(`[RatingService] Неповні дані про результати гри для оновлення рейтингу: ${game.id}`);
        return;
    }

    const { winners, loser } = game.winner;
    const allRegisteredPlayers = [...winners, loser].filter(p => p && !p.isGuest);

    if (allRegisteredPlayers.length < 1) {
        console.log(`[RatingService] Недостатньо зареєстрованих гравців для оновлення рейтингу в грі ${game.id}.`);
        return;
    }

    try {
        const playerIds = allRegisteredPlayers.map(p => p.dbId);
        const placeholders = playerIds.map(() => '?').join(',');
        const sql = `SELECT id, rating, rd, vol FROM users WHERE id IN (${placeholders})`;

        const playersData = await new Promise((resolve, reject) => {
            db.all(sql, playerIds, (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });

        const dbPlayersMap = new Map(playersData.map(p => [p.id, p]));
        const glickoPlayersMap = new Map();
        const matchesPerPlayer = new Map();

        allRegisteredPlayers.forEach(p => {
            const dbData = dbPlayersMap.get(p.dbId);
            if (dbData) {
                const playerObj = glicko.makePlayer(
                    dbData.rating,
                    Math.max(dbData.rd, MIN_RD),
                    dbData.vol
                );
                glickoPlayersMap.set(p.dbId, playerObj);
                matchesPerPlayer.set(playerObj, []);
            }
        });

        const glickoWinners = winners.map(w => glickoPlayersMap.get(w.dbId)).filter(Boolean);
        const glickoLoser = glickoPlayersMap.get(loser.dbId);

        if (glickoLoser && glickoWinners.length > 0) {
            glickoWinners.forEach(winnerGlickoPlayer => {
                matchesPerPlayer.get(winnerGlickoPlayer).push([glickoLoser, 1]);
                matchesPerPlayer.get(glickoLoser).push([winnerGlickoPlayer, 0]);
            });
        } else {
            console.log(`[RatingService] Не вдалося сформувати матчі для гри ${game.id} (можливо, програв гість).`);
        }

        if ([...matchesPerPlayer.values()].every(m => m.length === 0)) {
            console.log(`[RatingService] Не створено жодного матчу для розрахунку рейтингу в грі ${game.id}.`);
            return;
        }

        glicko.updateRatings(matchesPerPlayer);

        const updatePromises = [];
        const currentTimeISO = new Date().toISOString();

        allRegisteredPlayers.forEach(player => {
            const userId = player.dbId;
            const updatedGlickoPlayer = glickoPlayersMap.get(userId);
            if (updatedGlickoPlayer) {
                const newRating = updatedGlickoPlayer.getRating();
                const newRd = updatedGlickoPlayer.getRd();
                const newVol = updatedGlickoPlayer.getVol();

                const updateSql = `UPDATE users SET rating = ?, rd = ?, vol = ?, last_game_timestamp = ? WHERE id = ?`;
                updatePromises.push(new Promise((resolve, reject) => {
                    db.run(updateSql, [newRating, newRd, newVol, currentTimeISO, userId], (err) => {
                        if (err) return reject(err);
                        console.log(`[RatingService] Рейтинг для користувача ${userId} оновлено: R=${newRating.toFixed(2)}, RD=${newRd.toFixed(2)}, Vol=${newVol.toFixed(4)}`);
                        resolve();
                    });
                }));
            }
        });

        await Promise.all(updatePromises);
        console.log(`[RatingService] Усі рейтинги для гри ${game.id} успішно оновлено.`);

    } catch (error) {
        console.error(`[RatingService] Помилка під час оновлення рейтингів для гри ${game.id}:`, error);
    }
}

module.exports = {
    updateRatingsAfterGame
};