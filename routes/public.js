const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');

let appVersion = 'unknown';
try {
    const packageJsonPath = path.join(__dirname, '../package.json');
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
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
}

router.get('/health', (req, res) => {
    const onlineUsersMap = req.app.get('onlineUsers');
    const activeGamesMap = req.app.get('activeGames') || {};

    const onlineCount = onlineUsersMap ? onlineUsersMap.size : 0;
    const totalGamesCount = Object.keys(activeGamesMap).length;

    let playingGames = 0;
    let waitingLobbies = 0;
    let playersInMatches = 0;

    Object.values(activeGamesMap).forEach(game => {
        if (game.status === 'in_progress') {
            playingGames++;
            playersInMatches += (game.playerOrder ? game.playerOrder.length : 0);
        } else if (game.status === 'waiting') {
            waitingLobbies++;
        }
    });

    const memory = process.memoryUsage();

    const stats = {
        status: 'OK',
        timestamp: new Date().toISOString(),

        app: {
            name: 'Durak Online',
            version: appVersion,
            environment: process.env.NODE_ENV || 'development',
            uptime: formatUptime(process.uptime()),
        },

        metrics: {
            users_online: onlineCount,
            active_sessions: totalGamesCount,
            games_playing: playingGames,
            lobbies_waiting: waitingLobbies,
            players_ingame: playersInMatches
        },

        system: {
            memory_rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
            memory_heap_used: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
            platform: process.platform,
            node_version: process.version
        }
    };

    res.header("Content-Type", "application/json");
    res.send(JSON.stringify(stats, null, 4));
});

router.get('/leaderboard', (req, res) => {
    const { type = 'rating', limit = 20 } = req.query;

    const allowedSortTypes = {
        rating: 'rating',
        wins: 'wins',
        win_streak: 'win_streak'
    };

    const orderByColumn = allowedSortTypes[type];
    if (!orderByColumn) {
        return res.status(400).json({ error: 'Invalid leaderboard type' });
    }

    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10)), 100);

    const sql = `
        SELECT id, username, rating, wins, win_streak, is_verified
        FROM users
        WHERE is_banned = FALSE
        ORDER BY ${orderByColumn} DESC
            LIMIT ?
    `;

    db.all(sql, [safeLimit], (err, rows) => {
        if (err) {
            console.error("Помилка отримання публічного лідерборду:", err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
    });
});

router.get('/lobbies', (req, res) => {
    const games = req.app.get('activeGames');
    if (!games) return res.json([]);

    const publicLobbies = Object.values(games)
        .filter(game => {
            return game.status === 'waiting' &&
                game.settings.lobbyType === 'public' &&
                game.playerOrder.length > 0;
        })
        .map(game => ({
            gameId: game.id,
            hostName: game.players[game.hostId]?.name || 'Unknown',
            playerCount: game.playerOrder.length,
            maxPlayers: game.settings.maxPlayers,
            betAmount: game.settings.betAmount || 0,
            deckSize: game.settings.deckSize || 36,
            gameMode: game.settings.gameMode || 'podkidnoy',
            turnDuration: game.settings.turnDuration !== undefined ? game.settings.turnDuration : 60
        }));

    res.json(publicLobbies);
});

module.exports = router;
