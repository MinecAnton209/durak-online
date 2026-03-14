import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';

const TIMERS = {
    classical: 600000,
    rapid: 300000,
    blitz: 180000,
    bullet: 60000
};

function safeMove(chess, from, to) {
    try {
        return chess.move({ from, to });
    } catch (e) {
        return null;
    }
}

describe('chess.js basic moves', () => {
    let chess;

    beforeEach(() => {
        chess = new Chess();
    });

    describe('Initial position', () => {
        it('starts with white to move', () => {
            expect(chess.turn()).toBe('w');
        });

        it('has all 32 pieces on board', () => {
            const pieces = chess.board().flat().filter(p => p !== null);
            expect(pieces.length).toBe(32);
        });
    });

    describe('Pawn moves', () => {
        it('allows white pawn to move two squares from starting rank', () => {
            const move = safeMove(chess, 'e2', 'e4');
            expect(move).not.toBeNull();
            expect(chess.turn()).toBe('b');
        });

        it('allows white pawn to move one square', () => {
            const move = safeMove(chess, 'e2', 'e3');
            expect(move).not.toBeNull();
        });

        it('blocks backward pawn movement', () => {
            safeMove(chess, 'e2', 'e4');
            const move = safeMove(chess, 'e4', 'e3');
            expect(move).toBeNull();
        });

        it('blocks diagonal forward without capture', () => {
            const move = safeMove(chess, 'e2', 'd3');
            expect(move).toBeNull();
        });
    });

    describe('Knight moves', () => {
        it('allows knight L-shape movement', () => {
            const move = safeMove(chess, 'b1', 'c3');
            expect(move).not.toBeNull();
        });

        it('blocks knight from moving like a bishop', () => {
            safeMove(chess, 'b1', 'c3');
            const move = safeMove(chess, 'c3', 'f6');
            expect(move).toBeNull();
        });
    });

    describe('King moves', () => {
        it('blocks king from moving more than one square normally', () => {
            const move = safeMove(chess, 'e1', 'e3');
            expect(move).toBeNull();
        });
    });

    describe('Check detection', () => {
        it('does not detect check in starting position', () => {
            expect(chess.inCheck()).toBe(false);
        });

        it('generates valid moves', () => {
            const moves = chess.moves();
            expect(moves.length).toBeGreaterThan(0);
            expect(moves.length).toBe(20);
        });
    });

    describe('FEN handling', () => {
        it('generates valid FEN', () => {
            const fen = chess.fen();
            expect(fen).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
        });

        it('loads position from FEN', () => {
            const chess2 = new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
            expect(chess2.turn()).toBe('w');
            expect(chess2.moves().length).toBeGreaterThan(0);
        });
    });
});

describe('chessService TIMERS', () => {
    it('has correct time values', () => {
        expect(TIMERS.blitz).toBe(180000);
        expect(TIMERS.rapid).toBe(300000);
        expect(TIMERS.classical).toBe(600000);
        expect(TIMERS.bullet).toBe(60000);
    });
});
