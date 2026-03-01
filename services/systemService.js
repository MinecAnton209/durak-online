const path = require('path');
const prisma = require('../db/prisma');
const { performance } = require('perf_hooks');

async function getSystemStats(onlineUsers, games) {
    try {
        const onlineCount = onlineUsers ? onlineUsers.size : 0;
        const totalGamesCount = Object.keys(games || {}).length;

        let gamesInProgress = 0;
        let publicLobbies = 0;
        let privateLobbies = 0;
        let playersInMatches = 0;
        let botGames = 0;

        for (const game of Object.values(games || {})) {
            if (game.status === 'in_progress') {
                gamesInProgress++;
                playersInMatches += game.playerOrder.length;
                if (Object.values(game.players).some(p => p.isBot)) {
                    botGames++;
                }
            } else if (game.status === 'waiting') {
                if (game.settings.lobbyType === 'private') privateLobbies++;
                else publicLobbies++;
            }
        }

        const dbStartTime = performance.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbPing = Math.round(performance.now() - dbStartTime);

        const today = new Date().toISOString().slice(0, 10);
        let dailyStats = await prisma.systemStatsDaily.findUnique({ where: { date: today } });
        if (!dailyStats) {
            dailyStats = { new_registrations: 0, games_played: 0 };
        }

        const memory = process.memoryUsage();

        let currentAppVersion = 'unknown';
        try {
            const packageJsonPath = path.join(__dirname, '../package.json');
            const fs = require('fs');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                currentAppVersion = packageJson.version;
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

        return {
            status: 'OK',
            timestamp: new Date().toISOString(),
            app: {
                version: currentAppVersion,
                environment: process.env.NODE_ENV || 'development',
                uptime: formatUptime(process.uptime()),
            },
            activity: {
                users_online: onlineCount,
                sessions_total: totalGamesCount,
                games_in_progress: gamesInProgress,
                lobbies_waiting: publicLobbies + privateLobbies,
                public_lobbies: publicLobbies,
                private_lobbies: privateLobbies,
                players_in_game: playersInMatches,
                bot_games_active: botGames,
            },
            daily_stats: {
                date: today,
                registrations_today: dailyStats.new_registrations,
                games_played_today: dailyStats.games_played,
            },
            system: {
                memory_rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
                node_version: process.version,
                db_ping_ms: dbPing,
            }
        };
    } catch (error) {
        console.error('[Health] Error getting system stats:', error);
        return null;
    }
}

module.exports = {
    getSystemStats
};
