import { describe, it, expect } from 'vitest';
import { getBotMove } from '../services/botLogic';

const C = (rank, suit) => ({ rank, suit });

function botGame({ botCards, table, trumpSuit = '♠', attackerId, defenderId, botId = 'bot' }) {
    return {
        trumpSuit,
        table,
        attackerId,
        defenderId,
        turn: attackerId,
        players: { [botId]: { id: botId, cards: botCards } }
    };
}

describe('getBotMove: defense', () => {
    const attack = C('K', '♣'); // non-trump attack

    it('takes when no card can beat', () => {
        const game = botGame({
            botCards: [C('6', '♦'), C('9', '♥')],
            table: [attack],
            attackerId: 'p1',
            defenderId: 'bot'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'medium' });
        expect(action.type).toBe('take');
    });

    it('beats with weakest valid card at medium difficulty', () => {
        // 6♠ (trump) beats K♣; 9♠ (trump) also beats. Weakest trump is 6♠.
        const game = botGame({
            botCards: [C('9', '♠'), C('6', '♠')],
            table: [attack],
            attackerId: 'p1',
            defenderId: 'bot'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'medium' });
        expect(action.type).toBe('move');
        expect(action.card).toEqual(C('6', '♠'));
    });

    it('prefers a non-trump beat over a trump when both work at medium', () => {
        // Attack 9♦: A♦ beats it same-suit, 6♠ beats it as trump. Weakest valid = A♦.
        const game = botGame({
            botCards: [C('A', '♦'), C('6', '♠')],
            table: [C('9', '♦')],
            attackerId: 'p1',
            defenderId: 'bot'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'medium' });
        expect(action.type).toBe('move');
        expect(action.card).toEqual(C('A', '♦'));
    });

    it('returns a move of a card that actually beats the attack', () => {
        const game = botGame({
            botCards: [C('A', '♦'), C('9', '♠')],
            table: [attack],
            attackerId: 'p1',
            defenderId: 'bot'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'hard' });
        expect(action.type).toBe('move');
        // beat check: same suit A♦ > K♣, or trump 9♠ beats
        const beats = action.card.suit === attack.suit
            ? action.card.rank > attack.rank
            : action.card.suit === game.trumpSuit;
        expect(beats).toBe(true);
    });
});

describe('getBotMove: attack', () => {
    it('passes when it has no card matching a table rank', () => {
        const game = botGame({
            botCards: [C('6', '♠'), C('7', '♠')],
            table: [C('K', '♦')], // only rank K on table
            attackerId: 'bot',
            defenderId: 'p1'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'medium' });
        expect(action.type).toBe('pass');
    });

    it('leads with a card when table is empty', () => {
        const game = botGame({
            botCards: [C('6', '♠'), C('7', '♦')],
            table: [],
            attackerId: 'bot',
            defenderId: 'p1'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'medium' });
        expect(action.type).toBe('move');
        expect(action.card).toEqual(C('7', '♦')); // medium avoids leading trump when non-trump available
    });

    it('can throw a card matching the table rank when attacking', () => {
        const game = botGame({
            botCards: [C('K', '♣'), C('9', '♠')],
            table: [C('K', '♦')], // rank K on table
            attackerId: 'bot',
            defenderId: 'p1'
        });
        const { action } = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'easy' });
        expect(action.type).toBe('move');
        expect(action.card.rank).toBe('K');
    });
});

describe('getBotMove: structure', () => {
    it('returns an action and a delay', () => {
        const game = botGame({
            botCards: [C('6', '♦')],
            table: [],
            attackerId: 'bot',
            defenderId: 'p1'
        });
        const result = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'medium' });
        expect(result).toHaveProperty('action');
        expect(result).toHaveProperty('delay');
        expect(typeof result.delay).toBe('number');
    });

    it('impossible difficulty thinks fast', () => {
        const game = botGame({
            botCards: [C('6', '♦')],
            table: [],
            attackerId: 'bot',
            defenderId: 'p1'
        });
        const result = getBotMove(game, { id: 'bot', cards: game.players.bot.cards, difficulty: 'impossible' });
        expect(result.delay).toBeLessThanOrEqual(500);
    });
});
