const express = require('express');
const router = express.Router();
const db = require('../db');

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

    if (!games) {
        return res.json([]);
    }

    const publicLobbies = Object.values(games)
        .filter(game => game.status === 'waiting' && game.settings.lobbyType === 'public')
        .map(game => ({
            gameId: game.id,
            hostName: game.players[game.hostId]?.name || 'Unknown',
            playerCount: Object.keys(game.players).length,
            maxPlayers: game.settings.maxPlayers,
            betAmount: game.settings.betAmount || 0,
            deckSize: game.settings.deckSize || 36
        }));

    res.json(publicLobbies);
});

module.exports = router;