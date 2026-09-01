import { Glicko2 } from 'glicko2';
import { inArray, eq } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { user } from '../db/schema.ts';
import { getDb } from '../db/drizzle.js';
import type { DrizzleDB } from '../db/drizzle.js';
import type { GameState, Player } from '../types/index.js';

const MIN_RD = 50;

const settings = {
  tau: 0.5,
  rating: 0,
  rd: 150,
  vol: 0.1
};

const glicko = new Glicko2(settings);

(glicko as any)._default_rating = settings.rating;

async function updateRatingsAfterGame(game: GameState, executor: DrizzleDB = getDb()): Promise<void> {
  if (!game || !game.winner || !game.winner.winners || !game.winner.loser) {
    console.warn(`[RatingService] Incomplete game result data for rating update: ${game?.id}`);
    return;
  }

  const { winners, loser } = game.winner;
  const allRegisteredPlayers = [...winners, loser].filter((p): p is Player => p && !p.isGuest);

  if (allRegisteredPlayers.length < 1) {
    console.log(`[RatingService] Not enough registered players to update ratings for game ${game.id}.`);
    return;
  }

  try {
    const playerIds = allRegisteredPlayers.map((p) => p.dbId);

    const playersData = await executor
      .select({
        id: user.id,
        rating: user.rating,
        rd: user.rd,
        vol: user.vol
      })
      .from(user)
      .where(inArray(user.id, playerIds.filter((id): id is number => id !== null)));

    const dbPlayersMap = new Map(playersData.map((p) => [p.id, p]));
    glicko.removePlayers();

    const glickoPlayersMap = new Map<number, any>();

    const matchesArray: [any, any, number][] = [];

    allRegisteredPlayers.forEach((p) => {
      const dbData = dbPlayersMap.get(p.dbId!);
      if (dbData) {
        const playerObj = glicko.makePlayer(
          dbData.rating,
          Math.max(dbData.rd, MIN_RD),
          dbData.vol
        );
        glickoPlayersMap.set(p.dbId!, playerObj);
      }
    });

    const glickoWinners = winners.map((w) => glickoPlayersMap.get(w?.dbId as number)).filter(Boolean);
    const glickoLoser = glickoPlayersMap.get(loser.dbId!);

    if (glickoLoser && glickoWinners.length > 0) {
      glickoWinners.forEach((winnerGlickoPlayer) => {
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
    const updatePromises = allRegisteredPlayers.map((player) => {
      const userId = player.dbId;
      const updatedGlickoPlayer = glickoPlayersMap.get(userId!);
      if (!updatedGlickoPlayer) return Promise.resolve();

      const newRating = updatedGlickoPlayer.getRating();
      const newRd = updatedGlickoPlayer.getRd();
      const newVol = updatedGlickoPlayer.getVol();

      console.log(`[RatingService] Rating updated for user ${userId}: R=${newRating.toFixed(2)}, RD=${newRd.toFixed(2)}, Vol=${newVol.toFixed(4)}`);

      return executor
        .update(user)
        .set({
          rating: newRating,
          rd: newRd,
          vol: newVol,
          last_game_timestamp: currentTime.toISOString()
        })
        .where(eq(user.id, userId!));
    });

    await Promise.all(updatePromises);
    console.log(`[RatingService] All ratings for game ${game.id} updated successfully.`);
  } catch (error: any) {
    console.error(`[RatingService] Error updating ratings for game ${game.id}:`, error);
  }
}

export { updateRatingsAfterGame };

export default { updateRatingsAfterGame };
