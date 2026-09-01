import type { GameState, Player } from '../types/index.js';

interface Card {
  suit: string;
  rank: string;
}

const RANK_VALUES: Record<string, number> = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function getCardValue(card: Card | undefined, trumpSuit: any): number {
    if (!card) return 0;
    let val = RANK_VALUES[card.rank] || 0;
    if (card.suit === trumpSuit) val += 20;
    return val;
}

function canBeat(attackCard: Card | undefined, defendCard: Card | undefined, trumpSuit: any): boolean {
    if (!attackCard || !defendCard) return false;

    if (attackCard.suit === defendCard.suit) {
        return (RANK_VALUES[defendCard.rank] || 0) > (RANK_VALUES[attackCard.rank] || 0);
    }
    return defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit;
}

function sortByValue(cards: Card[], trumpSuit: any): Card[] {
    return [...cards].sort((a: Card, b: Card) => getCardValue(a, trumpSuit) - getCardValue(b, trumpSuit));
}

function getBotMove(game: GameState, botPlayer: Player): { action: any; delay: number } {
    const difficulty = botPlayer.difficulty || 'medium';
    const isDefender = game.defenderId === botPlayer.id;
    const isAttacker = game.attackerId === botPlayer.id || game.turn === botPlayer.id;

    let delay = Math.random() * 1000 + 1000;
    if (difficulty === 'child') delay = 3000;
    if (difficulty === 'impossible') delay = 500;

    let action = null;

    if (isDefender) {
        action = getDefenseMove(game, botPlayer, difficulty);
    } else {
        action = getAttackMove(game, botPlayer, difficulty);
    }

    return { action, delay };
}

function getDefenseMove(game: GameState, bot: Player, diff: string): any {
    const attackCard = game.table[game.table.length - 1];
    if (!attackCard) return { type: 'take' };

    let possibleMoves = bot.cards.filter((c) => canBeat(attackCard, c, game.trumpSuit as any));

    possibleMoves.sort((a: Card, b: Card) => getCardValue(a, game.trumpSuit as any) - getCardValue(b, game.trumpSuit as any));

    if (possibleMoves.length === 0) {
        return { type: 'take' };
    }

    if (diff === 'child') {
        const randomIdx = Math.floor(Math.random() * possibleMoves.length);
        return { type: 'move', card: possibleMoves[randomIdx] };
    }

    if (diff === 'beginner') {
        if (Math.random() < 0.3) return { type: 'move', card: possibleMoves[possibleMoves.length - 1] };
        return { type: 'move', card: possibleMoves[0] };
    }

    if (diff === 'easy') {
        return { type: 'move', card: possibleMoves[0] };
    }

    if (diff === 'medium') {
        return { type: 'move', card: possibleMoves[0] };
    }

    if (diff === 'hard' || diff === 'impossible') {
        const nonTrumpMoves = possibleMoves.filter((c: Card) => c.suit !== (game.trumpSuit as any));
        if (nonTrumpMoves.length > 0) {
            return { type: 'move', card: sortByValue(nonTrumpMoves, game.trumpSuit as any)[0] };
        }
        const mustBurnTrump = attackCard.suit !== (game.trumpSuit as any);
        if (mustBurnTrump && bot.cards.length <= 2) {
            return { type: 'take' };
        }
        return { type: 'move', card: sortByValue(possibleMoves, game.trumpSuit as any)[0] };
    }

    return { type: 'take' };
}

function getAttackMove(game: GameState, bot: Player, diff: string): any {
    const tableRanks = game.table.map((c) => c.rank);

    let validCards: Card[] = [];
    if (game.table.length === 0) {
        validCards = [...bot.cards];
    } else {
        validCards = bot.cards.filter((c) => tableRanks.includes(c.rank));
    }

    validCards.sort((a: Card, b: Card) => getCardValue(a, game.trumpSuit as any) - getCardValue(b, game.trumpSuit as any));

    if (validCards.length === 0) {
        return { type: 'pass' };
    }

    if (diff === 'child') {
        const randomIdx = Math.floor(Math.random() * validCards.length);
        return { type: 'move', card: validCards[randomIdx] };
    }

    if (diff === 'beginner') {
        if (game.table.length === 0) {
            const nonTrumps = validCards.filter((c: Card) => c.suit !== (game.trumpSuit as any));
            if (nonTrumps.length > 0) return { type: 'move', card: nonTrumps[nonTrumps.length - 1] };
        }
        return { type: 'move', card: validCards[0] };
    }

    if (diff === 'easy') {
        return { type: 'move', card: validCards[0] };
    }

    if (diff === 'medium') {
        const nonTrumps = validCards.filter((c: Card) => c.suit !== (game.trumpSuit as any));
        if (nonTrumps.length > 0) return { type: 'move', card: nonTrumps[0] };
        return { type: 'move', card: validCards[0] };
    }

    if (diff === 'hard' || diff === 'impossible') {
        const defender: any = (game.players as any)[game.defenderId || ''];
        const defenderLow = defender && defender?.cards?.length <= 2;

        const counts: Record<string, number> = {};
        bot.cards.forEach((c: Card) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });

        const pairs = validCards
            .filter((c) => (counts[c.rank] || 0) > 1 && c.suit !== (game.trumpSuit as any))
            .sort((a: Card, b: Card) => getCardValue(a, game.trumpSuit as any) - getCardValue(b, game.trumpSuit as any));
        if (defenderLow && pairs.length > 0 && game.table.length % 2 === 0) {
            return { type: 'move', card: pairs[0] };
        }

        const nonTrump = validCards.filter((c: Card) => c.suit !== (game.trumpSuit as any));
        const pool = (game.table.length === 0 && nonTrump.length > 0) ? nonTrump : validCards;

        if (game.table.length === 0 && pairs.length > 0) {
            return { type: 'move', card: sortByValue(pairs, game.trumpSuit as any)[0] };
        }
        return { type: 'move', card: sortByValue(pool, game.trumpSuit as any)[0] };
    }

    return { type: 'pass' };
}

export { getBotMove };

export default { getBotMove };
