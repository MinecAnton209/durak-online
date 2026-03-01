const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function cardVal(card, trumpSuit) {
    if (!card) return 0;
    return RANK_VALUES[card.rank] + (card.suit === trumpSuit ? 20 : 0);
}

function canBeat(attack, defense, trumpSuit) {
    if (!attack || !defense) return false;
    if (attack.suit === defense.suit) return RANK_VALUES[defense.rank] > RANK_VALUES[attack.rank];
    return defense.suit === trumpSuit && attack.suit !== trumpSuit;
}

/**
 * Evaluate a single action. Returns { label, reason }.
 * action format: { type, data: { card, targetIndex, ... }, userId, table, trumpSuit }
 */
function evaluateAction(action, handBefore) {
    const { type, data, trumpSuit, table } = action;
    const hand = handBefore || [];
    if (!trumpSuit) return { label: 'Good' };

    // ── ATTACK / TOSS ──────────────────────────────────────────
    if (type === 'attack' || type === 'toss') {
        const card = data?.card;
        if (!card) return { label: 'Good' };

        const isTrump = card.suit === trumpSuit;
        const nonTrumps = hand.filter(c => c.suit !== trumpSuit);
        const trumps = hand.filter(c => c.suit === trumpSuit);
        const playedVal = cardVal(card, trumpSuit);

        // Wasting high trump (Q+) when non-trumps are available
        if (isTrump && RANK_VALUES[card.rank] >= 12 && nonTrumps.length > 0) {
            return { label: 'Blunder', reason: `Wasted ${card.rank}${card.suit} trump when non-trump cards available` };
        }

        // Playing any trump when non-trumps available
        if (isTrump && nonTrumps.length > 0) {
            return { label: 'Mistake', reason: `Played trump while non-trumps available` };
        }

        // Playing low trump when non-trump available (edge case)
        if (isTrump && trumps.length > 1 && nonTrumps.length === 0) {
            const lowestTrump = trumps.slice().sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank])[0];
            if (playedVal > cardVal(lowestTrump, trumpSuit) + 4) {
                return { label: 'Inaccuracy', reason: 'Could have played a weaker trump' };
            }
        }

        // Playing non-trump: check if played the weakest available
        if (!isTrump) {
            const minNonTrump = Math.min(...nonTrumps.map(c => cardVal(c, trumpSuit)));
            if (playedVal === minNonTrump) return { label: 'Best Move' };
            if (playedVal <= minNonTrump + 2) return { label: 'Good' };
            return { label: 'Inaccuracy', reason: 'Could have played a weaker card' };
        }

        return { label: 'Good' };
    }

    // ── DEFEND ────────────────────────────────────────────────
    if (type === 'defend') {
        const card = data?.card;
        const targetIndex = data?.targetIndex ?? 0;
        const attackCard = (table || [])[targetIndex];
        if (!card || !attackCard) return { label: 'Good' };

        const beaters = hand.filter(c => canBeat(attackCard, c, trumpSuit));
        beaters.sort((a, b) => cardVal(a, trumpSuit) - cardVal(b, trumpSuit));

        if (beaters.length === 0) return { label: 'Best (Forced)' };

        const best = beaters[0];
        const bestVal = cardVal(best, trumpSuit);
        const playedVal = cardVal(card, trumpSuit);

        // Used trump when non-trump could beat it
        const nonTrumpBeaters = beaters.filter(c => c.suit !== trumpSuit);
        if (card.suit === trumpSuit && nonTrumpBeaters.length > 0) {
            if (nonTrumpBeaters.length > 0) {
                if (RANK_VALUES[card.rank] >= 13) {
                    return { label: 'Blunder', reason: `Wasted ${card.rank}${card.suit} trump — could defend with non-trump` };
                }
                return { label: 'Mistake', reason: `Wasted trump — non-trump defense was available` };
            }
        }

        // Played the weakest possible — perfect
        if (card.rank === best.rank && card.suit === best.suit) return { label: 'Best Move' };

        // Over-spent significantly
        const diff = playedVal - bestVal;
        if (diff >= 8) return { label: 'Mistake', reason: `Over-spent by ${diff} points; best was ${best.rank}${best.suit}` };
        if (diff >= 4) return { label: 'Inaccuracy', reason: `Could have used ${best.rank}${best.suit} instead` };

        return { label: 'Excellent' };
    }

    // ── TAKE ──────────────────────────────────────────────────
    if (type === 'take') {
        const tableCards = (table || []).filter(c => c && typeof c === 'object');
        const unbeatenAttacks = [];

        // The table is a flat array: [attack, defense?, attack, defense?, ...]
        for (let i = 0; i < tableCards.length; i += 2) {
            const atk = tableCards[i];
            const def = tableCards[i + 1];
            if (atk && !def) unbeatenAttacks.push(atk);
        }

        if (unbeatenAttacks.length === 0 && tableCards.length > 0) {
            // Even index cards are attacks when there's no corresponding defense
            unbeatenAttacks.push(...tableCards.filter((c, i) => i % 2 === 0));
        }

        // Check if we could have defended at least one
        const couldDefend = unbeatenAttacks.some(atk =>
            hand.some(c => canBeat(atk, c, trumpSuit))
        );

        if (couldDefend) {
            const hasNonTrumpDefense = unbeatenAttacks.some(atk =>
                hand.some(c => c.suit !== trumpSuit && canBeat(atk, c, trumpSuit))
            );

            if (hasNonTrumpDefense) {
                return {
                    label: 'Blunder',
                    reason: `Took ${tableCards.length} cards while able to defend with non-trump`
                };
            }
            return {
                label: 'Mistake',
                reason: `Could have used a trump to defend`
            };
        }

        return { label: 'Best (Forced)', reason: 'No valid defense available' };
    }

    // ── PASS ──────────────────────────────────────────────────
    if (type === 'pass') {
        return { label: 'Good' };
    }

    return { label: 'Good' };
}

/**
 * Full match analysis. Reconstructs hands step by step, evaluates each action.
 * History item format: { type, data, userId, table, trumpSuit }
 * initialHands: { [userId]: Card[] }
 */
function analyzeMatch(history, initialHands) {
    if (!history || !initialHands) return [];

    const analysis = [];

    // Track hands for each player throughout the game
    const hands = {};
    for (const [uid, cards] of Object.entries(initialHands)) {
        hands[uid] = Array.isArray(cards) ? [...cards] : [];
    }

    history.forEach((action) => {
        const uid = String(action.userId);
        const handBefore = hands[uid] ? [...hands[uid]] : [];

        // Evaluate with the hand the player had BEFORE this move
        const evaluation = evaluateAction(action, handBefore);
        analysis.push({ evaluation });

        // Mutate hand to keep future evaluations accurate
        const { type, data } = action;

        if (type === 'attack' || type === 'toss') {
            const card = data?.card;
            if (card && hands[uid]) {
                const idx = hands[uid].findIndex(c => c.rank === card.rank && c.suit === card.suit);
                if (idx !== -1) hands[uid].splice(idx, 1);
            }
        } else if (type === 'defend') {
            const card = data?.card;
            if (card && hands[uid]) {
                const idx = hands[uid].findIndex(c => c.rank === card.rank && c.suit === card.suit);
                if (idx !== -1) hands[uid].splice(idx, 1);
            }
        } else if (type === 'take') {
            // Player takes all cards from table
            const tableCards = Array.isArray(action.table) ? action.table : [];
            if (hands[uid]) hands[uid].push(...tableCards.filter(c => c && typeof c === 'object'));
        } else if (type === 'draw') {
            // Player draws cards from deck
            const cards = data?.cards;
            if (Array.isArray(cards) && hands[uid]) hands[uid].push(...cards);
        }
    });

    return analysis;
}

module.exports = { analyzeMatch };
