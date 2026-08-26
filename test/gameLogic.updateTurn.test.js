import { describe, it, expect } from 'vitest';
import { updateTurn } from '../utils/gameLogic';

function makePlayer(id, cards = []) {
    return { id, cards };
}

function makeGame(playerOrder, players, opts = {}) {
    return {
        playerOrder,
        players,
        deck: opts.deck ?? [],
        trumpSuit: opts.trumpSuit ?? '♠',
        table: opts.table ?? [],
        attackerId: opts.attackerId ?? null,
        defenderId: opts.defenderId ?? null,
        turn: opts.turn ?? null
    };
}

const C = (rank, suit) => ({ rank, suit });

describe('updateTurn: two players', () => {
    it('sets attacker and defender when both have cards', () => {
        const game = makeGame(
            ['p0', 'p1'],
            { p0: makePlayer('p0', [C('6', '♦')]), p1: makePlayer('p1', [C('7', '♣')]) }
        );
        updateTurn(game, 0);
        expect(game.attackerId).toBe('p0');
        expect(game.defenderId).toBe('p1');
        expect(game.turn).toBe('p0');
    });

    it('wraps intendedAttackerIndex into range', () => {
        const game = makeGame(
            ['p0', 'p1'],
            { p0: makePlayer('p0', [C('6', '♦')]), p1: makePlayer('p1', [C('7', '♣')]) }
        );
        updateTurn(game, 5); // 5 % 2 = 1
        expect(game.attackerId).toBe('p1');
        expect(game.defenderId).toBe('p0');
    });

    it('skips empty-handed intended attacker', () => {
        const game = makeGame(
            ['p0', 'p1'],
            { p0: makePlayer('p0', []), p1: makePlayer('p1', [C('7', '♣')]) }
        );
        updateTurn(game, 0);
        expect(game.attackerId).toBe('p1');
    });

    it('sets defenderId null when defender is the only other player and is empty', () => {
        const game = makeGame(
            ['p0', 'p1'],
            { p0: makePlayer('p0', []), p1: makePlayer('p1', [C('7', '♣')]) }
        );
        updateTurn(game, 0);
        expect(game.attackerId).toBe('p1');
        expect(game.defenderId).toBeNull();
    });

    it('returns without changes when both players are empty-handed', () => {
        const game = makeGame(
            ['p0', 'p1'],
            { p0: makePlayer('p0', []), p1: makePlayer('p1', []) }
        );
        updateTurn(game, 0);
        expect(game.attackerId).toBeNull();
        expect(game.defenderId).toBeNull();
    });
});

describe('updateTurn: three players', () => {
    function three(extra = {}) {
        return makeGame(
            ['p0', 'p1', 'p2'],
            {
                p0: makePlayer('p0', extra.p0 ?? [C('6', '♦')]),
                p1: makePlayer('p1', extra.p1 ?? [C('7', '♣')]),
                p2: makePlayer('p2', extra.p2 ?? [C('8', '♥')])
            }
        );
    }

    it('advances normally wrapping to first', () => {
        const game = three();
        updateTurn(game, 2);
        expect(game.attackerId).toBe('p2');
        expect(game.defenderId).toBe('p0');
    });

    it('skips empty defender to the next player', () => {
        const game = three({ p1: [] });
        updateTurn(game, 0);
        expect(game.attackerId).toBe('p0');
        expect(game.defenderId).toBe('p2');
    });

    it('skips empty intended attacker to next with cards', () => {
        const game = three({ p0: [] });
        updateTurn(game, 0);
        expect(game.attackerId).toBe('p1');
        expect(game.defenderId).toBe('p2');
    });

    it('skips a chain of empty players before attacker', () => {
        const game = three({ p0: [], p1: [] });
        updateTurn(game, 0);
        expect(game.attackerId).toBe('p2');
        // Only p2 has cards, so no defender can be assigned.
        expect(game.defenderId).toBeNull();
    });
});

describe('updateTurn: edge cases', () => {
    it('does nothing with fewer than two players', () => {
        const game = makeGame(
            ['p0'],
            { p0: makePlayer('p0', [C('6', '♦')]) }
        );
        updateTurn(game, 0);
        expect(game.attackerId).toBeNull();
        expect(game.defenderId).toBeNull();
    });

    it('does nothing with empty playerOrder', () => {
        const game = makeGame([], {});
        updateTurn(game, 0);
        expect(game.attackerId).toBeNull();
        expect(game.defenderId).toBeNull();
    });

    it('keeps attackerId untouched when all candidates are empty', () => {
        const game = makeGame(
            ['p0', 'p1', 'p2'],
            { p0: makePlayer('p0', []), p1: makePlayer('p1', []), p2: makePlayer('p2', []) },
            { attackerId: 'pX', defenderId: 'pY' }
        );
        updateTurn(game, 0);
        expect(game.attackerId).toBe('pX');
        expect(game.defenderId).toBe('pY');
    });
});
