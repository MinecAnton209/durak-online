import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './prismaClient.js';
import { getSystemStats } from '../services/systemService.js';

const ts = Date.now();
let user;

beforeAll(async () => {
    user = await prisma.user.create({ data: { username: `sys_${ts}`, password: 'h' } });
    await prisma.systemStatsDaily.upsert({
        where: { date: new Date().toISOString().slice(0, 10) },
        update: { new_registrations: 7, games_played: 3 },
        create: { date: new Date().toISOString().slice(0, 10), new_registrations: 7, games_played: 3 }
    });
});

afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: user.id } });
    // Don't leak the daily-stats row we seeded; statsService owns that table's baseline.
    await prisma.systemStatsDaily.deleteMany({ where: { date: new Date().toISOString().slice(0, 10) } });
});

describe('getSystemStats', () => {
    it('returns a populated status object', async () => {
        const stats = await getSystemStats(new Map(), {});
        expect(stats).not.toBeNull();
        expect(stats.status).toBe('OK');
        expect(stats.app).toHaveProperty('version');
        expect(stats.app).toHaveProperty('uptime');
        expect(stats.system).toHaveProperty('db_ping_ms');
        expect(typeof stats.system.db_ping_ms).toBe('number');
    });

    it('counts online users from the provided map', async () => {
        const online = new Map([['a', 's1'], ['b', 's2'], ['c', 's3']]);
        const stats = await getSystemStats(online, {});
        expect(stats.activity.users_online).toBe(3);
    });

    it('aggregates game counts from the games map', async () => {
        const games = {
            g1: { status: 'in_progress', playerOrder: ['p1', 'p2'], players: { p1: {}, p2: {} } },
            g2: { status: 'waiting', settings: { lobbyType: 'public' }, players: {} },
            g3: { status: 'waiting', settings: { lobbyType: 'private' }, players: {} }
        };
        const stats = await getSystemStats(new Map(), games);
        expect(stats.activity.games_in_progress).toBe(1);
        expect(stats.activity.public_lobbies).toBe(1);
        expect(stats.activity.private_lobbies).toBe(1);
        expect(stats.activity.players_in_game).toBe(2);
    });

    it('flags bot games', async () => {
        const games = {
            g1: { status: 'in_progress', playerOrder: ['p1'], players: { p1: { isBot: true } } }
        };
        const stats = await getSystemStats(new Map(), games);
        expect(stats.activity.bot_games_active).toBe(1);
    });

    it('includes today\'s daily stats from the DB', async () => {
        const stats = await getSystemStats(new Map(), {});
        expect(stats.daily_stats.registrations_today).toBe(7);
        expect(stats.daily_stats.games_played_today).toBe(3);
    });
});
