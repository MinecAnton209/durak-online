import express from 'express';
import db from '../db/drizzle.js';
import { user, systemStatsDaily } from '../db/schema.ts';
import path from 'path';
import fs from 'fs';
import { performance } from 'perf_hooks';

const router = express.Router();

let appVersion = 'unknown';
try {
    const packageJsonPath = path.join(import.meta.dirname, '../package.json');
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        appVersion = packageJson.version;
    }
} catch (e) {
    console.error("Failed to read package.json version", e);
}

function formatUptime(uptime) {
    const seconds = Math.floor(uptime);
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds % 60}s`].filter(Boolean);
    return parts.join(' ');
}

router.get('/health', async (req, res) => {
    try {
        const onlineUsersMap = req.app.get('onlineUsers');
        const activeGamesMap = req.app.get('activeGames') || {};

        const onlineCount = onlineUsersMap ? onlineUsersMap.size : 0;
        const totalGamesCount = Object.keys(activeGamesMap).length;

        let gamesInProgress = 0, publicLobbies = 0, privateLobbies = 0, playersInMatches = 0, botGames = 0;

        for (const game of Object.values(activeGamesMap)) {
            if (game.status === 'in_progress') {
                gamesInProgress++;
                playersInMatches += game.playerOrder.length;
                if (Object.values(game.players).some(p => p.isBot)) botGames++;
            } else if (game.status === 'waiting') {
                if (game.settings.lobbyType === 'private') privateLobbies++;
                else publicLobbies++;
            }
        }

        const dbStartTime = performance.now();
        await db.$client.unsafe('SELECT 1');
        const dbPing = Math.round(performance.now() - dbStartTime);

        const today = new Date().toISOString().slice(0, 10);
        let [dailyStats] = await db.select().from(systemStatsDaily).where(eq(systemStatsDaily.date, today)).limit(1);
        if (!dailyStats) dailyStats = { new_registrations: 0, games_played: 0 };

        const memory = process.memoryUsage();

        const stats = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            app: { version: appVersion, environment: process.env.NODE_ENV || 'development', uptime: formatUptime(process.uptime()) },
            activity: {
                users_online: onlineCount, sessions_total: totalGamesCount,
                games_in_progress: gamesInProgress, lobbies_waiting: publicLobbies + privateLobbies,
                public_lobbies: publicLobbies, private_lobbies: privateLobbies,
                players_in_game: playersInMatches, bot_games_active: botGames,
            },
            daily_stats: { date: today, registrations_today: dailyStats.new_registrations, games_played_today: dailyStats.games_played },
            system: { memory_rss: `${Math.round(memory.rss / 1024 / 1024)} MB`, node_version: process.version, db_ping_ms: dbPing }
        };

        res.header("Content-Type", "application/json");
        res.send(JSON.stringify(stats, null, 4));

    } catch (error) {
        console.error("[Health Check] Error:", error);
        res.status(503).json({ status: 'Service Unavailable ❌', error: error.message });
    }
});

router.get('/leaderboard', async (req, res) => {
    const { type = 'rating', limit = 20 } = req.query;

    const allowedSortTypes = { rating: 'rating', wins: 'wins', win_streak: 'win_streak' };
    const orderByColumn = allowedSortTypes[type];
    if (!orderByColumn) return res.status(400).json({ error: 'Invalid leaderboard type' });

    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10)), 100);

    try {
        const rows = await db.query.user.findMany({
            where: { is_banned: false },
            orderBy: [{ [orderByColumn]: 'desc' }],
            limit: safeLimit
        });
        const mapped = rows.map(r => ({
            id: r.id, username: r.username, rating: r.rating, wins: r.wins,
            win_streak: r.win_streak, is_verified: r.is_verified
        }));
        res.json(mapped);
    } catch (err) {
        console.error("Error fetching public leaderboard:", err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/lobbies', (req, res) => {
    const games = req.app.get('activeGames');
    if (!games) return res.json([]);

    const publicLobbies = Object.values(games)
        .filter(game => game.status === 'waiting' && game.settings.lobbyType === 'public' && game.playerOrder.length > 0)
        .map(game => ({
            gameId: game.id, hostName: game.players[game.hostId]?.name || 'Unknown',
            playerCount: game.playerOrder.length, maxPlayers: game.settings.maxPlayers,
            betAmount: game.settings.betAmount || 0, deckSize: game.settings.deckSize || 36,
            gameMode: game.settings.gameMode || 'podkidnoy',
            turnDuration: game.settings.turnDuration !== undefined ? game.settings.turnDuration : 60
        }));

    res.json(publicLobbies);
});

router.get('/game/:id/status', async (req, res) => {
    const games = req.app.get('activeGames');
    if (!games) return res.status(500).json({ error: 'Games not available' });

    const gameId = req.params.id.toUpperCase();
    const game = games[gameId];

    if (!game) {
        return res.status(404).json({ error: 'Game not found', i18nKey: 'error_game_not_found' });
    }

    res.json({
        gameId: game.id,
        status: game.status,
        playerCount: game.playerOrder.length,
        maxPlayers: game.settings.maxPlayers,
        settings: {
            gameMode: game.settings.gameMode,
            deckSize: game.settings.deckSize,
            turnDuration: game.settings.turnDuration,
            betAmount: game.settings.betAmount || 0,
            lobbyType: game.settings.lobbyType,
        },
        hostName: game.players[game.hostId]?.name || 'Unknown'
    });
});

export default router;
