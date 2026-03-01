const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function getCardValue(card, trumpSuit) {
    if (!card) return 0;
    let val = RANK_VALUES[card.rank];
    if (card.suit === trumpSuit) val += 20; // Trumps are always more valuable
    return val;
}

function canBeat(attackCard, defendCard, trumpSuit) {
    if (!attackCard || !defendCard) return false; // Safety check

    if (attackCard.suit === defendCard.suit) {
        return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank];
    }
    return defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit;
}

function decideMove(game, playerId) {
    const player = game.players[playerId];
    const difficulty = player.difficulty || 'medium';
    const isDefender = game.defenderId === player.id;

    if (isDefender) {
        // Find an unbeaten attack card
        let targetIndex = -1;
        for (let i = 0; i < game.table.length; i += 2) {
            if (game.table[i] && !game.table[i + 1]) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) return { type: 'pass' }; // Nothing to beat or error

        const attackCard = game.table[targetIndex];
        let possibleMoves = player.cards.filter(c => canBeat(attackCard, c, game.trumpSuit));
        possibleMoves.sort((a, b) => getCardValue(a, game.trumpSuit) - getCardValue(b, game.trumpSuit));

        if (possibleMoves.length === 0) return { type: 'take' };

        // Basic selection
        let selectedCard = possibleMoves[0];
        if (difficulty === 'child' && Math.random() < 0.5) {
            selectedCard = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }

        return { type: 'defend', card: selectedCard, targetIndex };
    } else {
        // Attack logic
        const tableRanks = game.table.filter(c => c).map(c => c.rank);
        let validCards = [];

        if (game.table.length === 0) {
            validCards = [...player.cards];
        } else {
            validCards = player.cards.filter(c => tableRanks.includes(c.rank));
        }

        validCards.sort((a, b) => getCardValue(a, game.trumpSuit) - getCardValue(b, game.trumpSuit));

        // Max 6 cards or defender hand size
        const defenderCards = game.players[game.defenderId]?.cards.length || 0;
        const unbeatenCount = game.table.filter((c, i) => i % 2 === 0 && !game.table[i + 1]).length;

        if (validCards.length === 0 || unbeatenCount >= defenderCards || game.table.length >= 12) {
            return { type: 'pass' };
        }

        let selectedCard = validCards[0];
        if (difficulty === 'child' && Math.random() < 0.5) {
            selectedCard = validCards[Math.floor(Math.random() * validCards.length)];
        }

        return { type: 'attack', card: selectedCard };
    }
}

module.exports = { decideMove };
