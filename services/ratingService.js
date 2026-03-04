const { Glicko2 } = require('glicko2');
const prisma = require('../db/prisma');

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
        console.warn(`[RatingService] Incomplete game result data for rating update: ${game?.id}`);
        return;
    }

    const { winners, loser } = game.winner;
    const allRegisteredPlayers = [...winners, loser].filter(p => p && !p.isGuest);

    if (allRegisteredPlayers.length < 1) {
        console.log(`[RatingService] Not enough registered players to update ratings for game ${game.id}.`);
        return;
    }

    try {
        const playerIds = allRegisteredPlayers.map(p => p.dbId);

        const playersData = await prisma.user.findMany({
            where: { id: { in: playerIds } },
            select: { id: true, rating: true, rd: true, vol: true }
        });

        const dbPlayersMap = new Map(playersData.map(p => [p.id, p]));
        // Remove any players registered in previous game calls
        glicko.removePlayers();

        const glickoPlayersMap = new Map();
        // glicko2 updateRatings expects a flat array of [player1, player2, outcome] triplets
        const matchesArray = [];

        allRegisteredPlayers.forEach(p => {
            const dbData = dbPlayersMap.get(p.dbId);
            if (dbData) {
                const playerObj = glicko.makePlayer(
                    dbData.rating,
                    Math.max(dbData.rd, MIN_RD),
                    dbData.vol
                );
                glickoPlayersMap.set(p.dbId, playerObj);
            }
        });

        const glickoWinners = winners.map(w => glickoPlayersMap.get(w.dbId)).filter(Boolean);
        const glickoLoser = glickoPlayersMap.get(loser.dbId);

        if (glickoLoser && glickoWinners.length > 0) {
            // glicko2 expects: [player1, player2, outcome] where outcome 1 = player1 wins
            glickoWinners.forEach(winnerGlickoPlayer => {
                matchesArray.push([winnerGlickoPlayer, glickoLoser, 1]);
            });
        } else {
            console.log(`[RatingService] Could not form matches for game ${game.id} (loser may be a guest).`);
        }

        if (matchesArray.length === 0) {
            console.log(`[RatingService] No matches created for rating calculation in game ${game.id}.`);
            return;
        }

        glicko.updateRatings(matchesArray);

        const currentTime = new Date();
        const updatePromises = allRegisteredPlayers.map(player => {
            const userId = player.dbId;
            const updatedGlickoPlayer = glickoPlayersMap.get(userId);
            if (!updatedGlickoPlayer) return Promise.resolve();

            const newRating = updatedGlickoPlayer.getRating();
            const newRd = updatedGlickoPlayer.getRd();
            const newVol = updatedGlickoPlayer.getVol();

            console.log(`[RatingService] Rating updated for user ${userId}: R=${newRating.toFixed(2)}, RD=${newRd.toFixed(2)}, Vol=${newVol.toFixed(4)}`);

            return prisma.user.update({
                where: { id: userId },
                data: { rating: newRating, rd: newRd, vol: newVol, last_game_timestamp: currentTime.toISOString() }
            });
        });

        await Promise.all(updatePromises);
        console.log(`[RatingService] All ratings for game ${game.id} updated successfully.`);

    } catch (error) {
        console.error(`[RatingService] Error updating ratings for game ${game.id}:`, error);
    }
}

module.exports = {
    updateRatingsAfterGame
};