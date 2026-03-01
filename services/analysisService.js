const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function getCardValue(card, trumpSuit) {
    if (!card) return 0;
    let val = RANK_VALUES[card.rank];
    if (card.suit === trumpSuit) val += 20;
    return val;
}

function canBeat(attackCard, defendCard, trumpSuit) {
    if (attackCard.suit === defendCard.suit) {
        return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank];
    }
    return defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit;
}

/**
 * Analyzes a game action and returns its quality.
 */
function evaluateAction(action, prevGameState) {
    const { type, data, playerId } = action;
    const trumpSuit = prevGameState.trumpSuit;
    const hand = prevGameState.hands[playerId] || [];
    const table = prevGameState.table;

    if (type === 'attack' || type === 'toss') {
        const card = data.card;
        const nonTrumps = hand.filter(c => c.suit !== trumpSuit);
        const minNonTrumpValue = nonTrumps.length > 0 ? Math.min(...nonTrumps.map(c => getCardValue(c, trumpSuit))) : Infinity;

        // If played a high trump as first attack when had non-trumps
        if (card.suit === trumpSuit && RANK_VALUES[card.rank] > 10 && nonTrumps.length > 0) {
            return { grade: 'MISTAKE', label: 'Mistake', reason: 'Wasting a high trump for attack' };
        }

        // Played minimal value card
        const cardValue = getCardValue(card, trumpSuit);
        if (cardValue <= minNonTrumpValue + 2) return { grade: 'BEST', label: 'Best' };

        return { grade: 'GOOD', label: 'Good' };
    }

    if (type === 'defend') {
        const playedCard = data.card;
        const attackCard = table[data.targetIndex];

        const possibleBeaters = hand.filter(c => canBeat(attackCard, c, trumpSuit));
        possibleBeaters.sort((a, b) => getCardValue(a, trumpSuit) - getCardValue(b, trumpSuit));

        if (possibleBeaters.length === 0) return { grade: 'BEST', label: 'Best (Forced)' }; // Shouldn't happen if action is valid

        const bestCard = possibleBeaters[0];
        const playedValue = getCardValue(playedCard, trumpSuit);
        const bestValue = getCardValue(bestCard, trumpSuit);

        if (playedCard.rank === bestCard.rank && playedCard.suit === bestCard.suit) {
            return { grade: 'BEST', label: 'Best Move' };
        }

        if (playedCard.suit === trumpSuit && bestCard.suit !== trumpSuit) {
            return { grade: 'MISTAKE', label: 'Mistake', reason: 'Wasted a trump' };
        }

        if (playedValue > bestValue + 4) {
            return { grade: 'INACCURACY', label: 'Inaccuracy', reason: 'Used a higher card than necessary' };
        }

        return { grade: 'EXCELLENT', label: 'Excellent' };
    }

    if (type === 'take') {
        const attackCard = table[table.length - 1];
        const canBeatAny = hand.some(c => canBeat(attackCard, c, trumpSuit));

        if (canBeatAny) {
            const nonTrumps = hand.filter(c => c.suit !== trumpSuit && canBeat(attackCard, c, trumpSuit));
            if (nonTrumps.length > 0) {
                return { grade: 'BLUNDER', label: 'Blunder', reason: 'Took cards while having defense' };
            }
            return { grade: 'MISTAKE', label: 'Mistake', reason: 'Should have used a trump to defend' };
        }
        return { grade: 'BEST', label: 'Best (Forced)' };
    }

    return { grade: 'GOOD', label: 'Good' };
}

/**
 * Full match analysis.
 */
function analyzeMatch(history, initialHands) {
    const analysis = [];
    const currentHands = JSON.parse(JSON.stringify(initialHands));
    let currentTable = [];

    // Basic state tracking to provide "prevGameState" to evaluator
    history.forEach((action, index) => {
        const prevState = {
            hands: JSON.parse(JSON.stringify(currentHands)),
            table: [...currentTable],
            trumpSuit: action.trumpSuit // Assuming trumpSuit is in each action or can be inferred
        };

        const evaluation = evaluateAction(action, prevState);
        analysis.push({
            ...action,
            evaluation
        });

        // Update state for next step
        if (action.type === 'attack' || action.type === 'defend' || action.type === 'toss') {
            const pId = action.playerId;
            if (currentHands[pId]) {
                currentHands[pId] = currentHands[pId].filter(c => !(c.rank === action.data.card.rank && c.suit === action.data.card.suit));
            }
            if (action.type === 'defend') {
                currentTable[action.data.targetIndex + 1] = action.data.card;
            } else {
                currentTable.push(action.data.card);
            }
        } else if (action.type === 'take' || action.type === 'pass') {
            currentTable = [];
        }
    });

    return analysis;
}

module.exports = { analyzeMatch };
