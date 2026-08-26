import { describe, it, expect } from 'vitest';
import { getRouletteState, placeBet } from '../services/rouletteService';

describe('rouletteService: state', () => {
    it('exposes a state object with expected shape', () => {
        const state = getRouletteState();
        expect(state).toHaveProperty('phase');
        expect(state).toHaveProperty('timer');
        expect(state).toHaveProperty('history');
        expect(state).toHaveProperty('bets');
        expect(Array.isArray(state.history)).toBe(true);
        expect(typeof state.bets).toBe('object');
    });
});

describe('rouletteService: placeBet gating', () => {
    it('rejects bets when not in betting phase', () => {
        const state = getRouletteState();
        const prevPhase = state.phase;
        state.phase = 'waiting';
        const ok = placeBet('u1', { amount: 10, type: 'color', value: 'red' });
        expect(ok).toBe(false);
        expect(state.bets.u1).toBeUndefined();
        state.phase = prevPhase;
    });

    it('accepts bets during betting phase', () => {
        const state = getRouletteState();
        const prevPhase = state.phase;
        state.phase = 'betting';
        const ok = placeBet('u1', { amount: 10, type: 'color', value: 'red' });
        expect(ok).toBe(true);
        expect(state.bets.u1).toHaveLength(1);
        // cleanup
        delete state.bets.u1;
        state.phase = prevPhase;
    });

    it('accumulates multiple bets per user', () => {
        const state = getRouletteState();
        const prevPhase = state.phase;
        state.phase = 'betting';
        placeBet('u1', { amount: 10, type: 'color', value: 'red' });
        placeBet('u1', { amount: 20, type: 'number', value: 5 });
        expect(state.bets.u1).toHaveLength(2);
        placeBet('u2', { amount: 5, type: 'even-odd', value: 'odd' });
        expect(state.bets.u2).toHaveLength(1);
        // cleanup
        delete state.bets.u1;
        delete state.bets.u2;
        state.phase = prevPhase;
    });
});
