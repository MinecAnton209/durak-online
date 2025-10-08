jest.mock('../../../db', () => ({
    run: jest.fn().mockImplementation((query, params, callback) => {
        if (callback) callback(null);
    }),
    get: jest.fn().mockImplementation((query, params, callback) => {
        if (callback) callback(null, {});
    }),
    all: jest.fn().mockImplementation((query, params, callback) => {
        if (callback) callback(null, []);
    }),
    pool: {}
}));
jest.mock('../../../services/achievementService.js');
jest.mock('../../../services/ratingService.js');
jest.mock('../../../services/statsService.js');

const { createDeck, canBeat } = require('../../../controllers/gameController');

describe('gameController', () => {
    describe('createDeck', () => {
        it('should create a deck with 36 cards by default', () => {
            const deck = createDeck();
            expect(deck).toHaveLength(36);
        });

        it('should create a deck with 52 cards when specified', () => {
            const deck = createDeck(52);
            expect(deck).toHaveLength(52);
        });

        it('should create a deck with 24 cards when specified', () => {
            const deck = createDeck(24);
            expect(deck).toHaveLength(24);
        });

        it('should create a shuffled deck', () => {
            const deck1 = createDeck();
            const deck2 = createDeck();
            // There's a small chance this could fail if the shuffle results in the same order
            // but it's highly unlikely with a 36-card deck.
            expect(deck1).not.toEqual(deck2);
        });
    });

    describe('canBeat', () => {
        const trumpSuit = '♥';

        it('should return true if defending card has a higher rank of the same suit', () => {
            const attackCard = { suit: '♠', rank: '7' };
            const defendCard = { suit: '♠', rank: '10' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(true);
        });

        it('should return false if defending card has a lower rank of the same suit', () => {
            const attackCard = { suit: '♠', rank: '10' };
            const defendCard = { suit: '♠', rank: '7' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(false);
        });

        it('should return true if defending card is a trump and attacking card is not', () => {
            const attackCard = { suit: '♠', rank: 'A' };
            const defendCard = { suit: '♥', rank: '6' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(true);
        });

        it('should return false if attacking card is a trump and defending card is not', () => {
            const attackCard = { suit: '♥', rank: '6' };
            const defendCard = { suit: '♠', rank: 'A' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(false);
        });

        it('should return true if both are trumps and defending card has higher rank', () => {
            const attackCard = { suit: '♥', rank: '7' };
            const defendCard = { suit: '♥', rank: 'J' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(true);
        });

        it('should return false if both are trumps and defending card has lower rank', () => {
            const attackCard = { suit: '♥', rank: 'J' };
            const defendCard = { suit: '♥', rank: '7' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(false);
        });

        it('should return false for cards of different non-trump suits', () => {
            const attackCard = { suit: '♠', rank: '8' };
            const defendCard = { suit: '♣', rank: '9' };
            expect(canBeat(attackCard, defendCard, trumpSuit)).toBe(false);
        });
    });
});