import { describe, it, expect, afterEach } from 'vitest';
import { incrementDailyCounter } from '../services/statsService.js';
import { db, eq, deleteSystemStatsDaily, findSystemStatsDaily } from './dbHelpers.js';

const today = new Date().toISOString().slice(0, 10);

afterEach(async () => {
    await deleteSystemStatsDaily(today);
});

describe('incrementDailyCounter', () => {
    it('creates a new daily record on first call', async () => {
        await incrementDailyCounter('new_registrations');
        const record = await findSystemStatsDaily(today);
        expect(record).not.toBeNull();
        expect(record.new_registrations).toBe(1);
    });

    it('increments an existing record on sequential calls', async () => {
        await incrementDailyCounter('new_registrations');
        await incrementDailyCounter('new_registrations');
        await incrementDailyCounter('new_registrations');
        const record = await findSystemStatsDaily(today);
        expect(record.new_registrations).toBe(3);
    });

    it('increments games_played independently', async () => {
        await incrementDailyCounter('new_registrations');
        await incrementDailyCounter('games_played');
        const record = await findSystemStatsDaily(today);
        expect(record.new_registrations).toBe(1);
        expect(record.games_played).toBe(1);
    });

    it('handles unknown counter gracefully (catches error, no crash)', async () => {
        await expect(incrementDailyCounter('nonexistent_field')).resolves.toBeUndefined();
    });
});
