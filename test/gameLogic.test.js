import { describe, it, expect } from 'vitest';
import { createDeck, canBeat, getNextPlayerIndex, checkGameOver, RANK_VALUES } from '../utils/gameLogic';

describe('RANK_VALUES', () => {
    it('has correct values', () => {
        expect(RANK_VALUES['6']).toBe(6);
        expect(RANK_VALUES['A']).toBe(14);
        expect(RANK_VALUES['J']).toBe(11);
    });
});

describe('createDeck', () => {
    it('creates 36-card deck by default', () => {
        const deck = createDeck();
        expect(deck.length).toBe(36);
    });
    it('creates 24-card deck', () => {
        const deck = createDeck(24);
        expect(deck.length).toBe(24);
    });
    it('creates 52-card deck', () => {
        const deck = createDeck(52);
        expect(deck.length).toBe(52);
    });
    it('has only valid suits', () => {
        const deck = createDeck();
        const suits = new Set(deck.map(c => c.suit));
        expect([...suits].sort()).toEqual(['♣', '♦', '♠', '♥'].sort());
    });
    it('has unique cards', () => {
        const deck = createDeck();
        const unique = new Set(deck.map(c => c.rank + c.suit));
        expect(unique.size).toBe(36);
    });
    it('is shuffled (not deterministically sorted)', () => {
        // Run 3 decks and check they differ (astronomically unlikely to all match)
        const a = createDeck().map(c => c.rank + c.suit).join('');
        const b = createDeck().map(c => c.rank + c.suit).join('');
        const c = createDeck().map(c => c.rank + c.suit).join('');
        expect(a === b && b === c).toBe(false);
    });
});

describe('canBeat', () => {
    const trump = '♠';

    it('higher same suit beats lower', () => {
        expect(canBeat({ rank: '6', suit: '♦' }, { rank: 'K', suit: '♦' }, trump)).toBe(true);
    });
    it('lower same suit cannot beat higher', () => {
        expect(canBeat({ rank: 'A', suit: '♦' }, { rank: '6', suit: '♦' }, trump)).toBe(false);
    });
    it('same rank same suit cannot beat', () => {
        expect(canBeat({ rank: '9', suit: '♦' }, { rank: '9', suit: '♦' }, trump)).toBe(false);
    });
    it('trump beats non-trump regardless of rank', () => {
        expect(canBeat({ rank: 'A', suit: '♦' }, { rank: '6', suit: '♠' }, trump)).toBe(true);
    });
    it('non-trump cannot beat trump', () => {
        expect(canBeat({ rank: '6', suit: '♠' }, { rank: 'A', suit: '♦' }, trump)).toBe(false);
    });
    it('higher trump beats lower trump', () => {
        expect(canBeat({ rank: '6', suit: '♠' }, { rank: 'A', suit: '♠' }, trump)).toBe(true);
    });
    it('different non-trump suits cannot beat each other', () => {
        expect(canBeat({ rank: '6', suit: '♦' }, { rank: 'A', suit: '♣' }, trump)).toBe(false);
    });
    it('returns false for null cards', () => {
        expect(canBeat(null, { rank: 'A', suit: '♦' }, trump)).toBe(false);
        expect(canBeat({ rank: 'A', suit: '♦' }, null, trump)).toBe(false);
    });
});

describe('getNextPlayerIndex', () => {
    it('wraps around at end', () => {
        expect(getNextPlayerIndex(3, 4)).toBe(0);
    });
    it('advances normally', () => {
        expect(getNextPlayerIndex(0, 4)).toBe(1);
        expect(getNextPlayerIndex(2, 4)).toBe(3);
    });
    it('handles 0 players', () => {
        expect(getNextPlayerIndex(0, 0)).toBe(0);
    });
});

describe('checkGameOver', () => {
    const makeGame = ({ deck, players }) => ({
        deck,
        playerOrder: Object.keys(players),
        players,
        winner: null
    });

    it('returns false when deck has cards', () => {
        const game = makeGame({
            deck: [{ rank: '6', suit: '♦' }],
            players: { p1: { id: 'p1', cards: [] }, p2: { id: 'p2', cards: [] } }
        });
        expect(checkGameOver(game)).toBe(false);
        expect(game.winner).toBeNull();
    });

    it('returns false when multiple players still have cards', () => {
        const game = makeGame({
            deck: [],
            players: {
                p1: { id: 'p1', cards: [{ rank: 'A', suit: '♠' }] },
                p2: { id: 'p2', cards: [{ rank: 'K', suit: '♦' }] }
            }
        });
        expect(checkGameOver(game)).toBe(false);
    });

    it('identifies loser when one player has cards left', () => {
        const game = makeGame({
            deck: [],
            players: {
                p1: { id: 'p1', cards: [] },
                p2: { id: 'p2', cards: [{ rank: 'A', suit: '♠' }] }
            }
        });
        expect(checkGameOver(game)).toBe(true);
        expect(game.winner.loser.id).toBe('p2');
        expect(game.winner.winners.map(w => w.id)).toContain('p1');
    });

    it('handles draw (empty deck, all players out of cards)', () => {
        const game = makeGame({
            deck: [],
            players: {
                p1: { id: 'p1', cards: [] },
                p2: { id: 'p2', cards: [] }
            }
        });
        expect(checkGameOver(game)).toBe(true);
        expect(game.winner.loser).toBeNull();
        expect(game.winner.winners.length).toBe(2);
    });

    it('handles 3-player game with one loser', () => {
        const game = makeGame({
            deck: [],
            players: {
                p1: { id: 'p1', cards: [] },
                p2: { id: 'p2', cards: [] },
                p3: { id: 'p3', cards: [{ rank: '6', suit: '♦' }] }
            }
        });
        expect(checkGameOver(game)).toBe(true);
        expect(game.winner.loser.id).toBe('p3');
        expect(game.winner.winners.length).toBe(2);
    });
});
