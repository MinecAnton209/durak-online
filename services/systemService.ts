import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import db from '../db/drizzle.js';
import { systemStatsDaily } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';

interface SystemStats {
  status: string;
  timestamp: string;
  app: { version: string; environment: string; uptime: string };
  activity: {
    users_online: number;
    sessions_total: number;
    games_in_progress: number;
    lobbies_waiting: number;
    public_lobbies: number;
    private_lobbies: number;
    players_in_game: number;
    bot_games_active: number;
  };
  daily_stats: { date: string; registrations_today: number; games_played_today: number };
  system: { memory_rss: string; node_version: string; db_ping_ms: number };
}

async function getSystemStats(onlineUsers: Map<any, any> | null, games: Record<string, any> | null): Promise<SystemStats | null> {
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
        if (Object.values(game.players).some((p: any) => p.isBot)) {
          botGames++;
        }
      } else if (game.status === 'waiting') {
        if (game.settings.lobbyType === 'private') privateLobbies++;
        else publicLobbies++;
      }
    }

    const dbStartTime = performance.now();
    await db.$client.unsafe('SELECT 1');
    const dbPing = Math.round(performance.now() - dbStartTime);

    const today = new Date().toISOString().slice(0, 10);
    const [dailyStats] = await db
      .select()
      .from(systemStatsDaily)
      .where(eq(systemStatsDaily.date, today))
      .limit(1);

    const memory = process.memoryUsage();

    let currentAppVersion = 'unknown';
    try {
      const packageJsonPath = join(import.meta.dirname, '../package.json');
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        currentAppVersion = packageJson.version;
      }
    } catch (e: any) {
      console.error('Failed to read package.json version', e);
    }

    function formatUptime(uptime: number): string {
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
        uptime: formatUptime(process.uptime())
      },
      activity: {
        users_online: onlineCount,
        sessions_total: totalGamesCount,
        games_in_progress: gamesInProgress,
        lobbies_waiting: publicLobbies + privateLobbies,
        public_lobbies: publicLobbies,
        private_lobbies: privateLobbies,
        players_in_game: playersInMatches,
        bot_games_active: botGames
      },
      daily_stats: {
        date: today,
        registrations_today: dailyStats?.new_registrations ?? 0,
        games_played_today: dailyStats?.games_played ?? 0
      },
      system: {
        memory_rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        node_version: process.version,
        db_ping_ms: dbPing
      }
    };
  } catch (error: any) {
    console.error('[Health] Error getting system stats:', error);
    return null;
  }
}

export { getSystemStats };

export default { getSystemStats };
