const crypto = require('crypto');

const RANK_VALUES = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14
};

function createDeck(deckSize = 36) {
    const SUITS = ['♦', '♥', '♠', '♣'];
    let ranks;
    switch (deckSize) {
        case 52:
            ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            break;
        case 24:
            ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
            break;
        default:
            ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            break;
    }
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function canBeat(attackCard, defendCard, trumpSuit) {
    if (!attackCard || !defendCard) return false;
    if (attackCard.suit === defendCard.suit) return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank];
    if (defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit) return true;
    return false;
}

function getNextPlayerIndex(currentIndex, totalPlayers) {
    if (totalPlayers === 0) return 0;
    return (currentIndex + 1) % totalPlayers;
}

function updateTurn(game, intendedAttackerIndex) {
    if (game.playerOrder.length < 2) return;
    let currentAttackerIndex = intendedAttackerIndex % game.playerOrder.length;
    let attempts = 0;
    while (game.players[game.playerOrder[currentAttackerIndex]] && game.players[game.playerOrder[currentAttackerIndex]].cards.length === 0 && attempts < game.playerOrder.length) {
        currentAttackerIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
        attempts++;
    }
    if (attempts >= game.playerOrder.length) {
        return;
    }
    game.attackerId = game.playerOrder[currentAttackerIndex];
    let currentDefenderIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
    attempts = 0;
    while ((game.players[game.playerOrder[currentDefenderIndex]] && game.players[game.playerOrder[currentDefenderIndex]].cards.length === 0 && game.playerOrder.length > 1) && attempts < game.playerOrder.length) {
        currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        attempts++;
        if (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex) {
            currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        }
    }
    if (attempts >= game.playerOrder.length || (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex)) {
        game.defenderId = null;
    } else {
        game.defenderId = game.playerOrder[currentDefenderIndex];
    }
    game.turn = game.attackerId;
}

function checkGameOver(game) {
    if (game.deck.length === 0) {
        const playersWithCards = game.playerOrder.map(id => game.players[id]).filter(p => p && p.cards.length > 0);
        if (playersWithCards.length <= 1) {
            const loser = playersWithCards.length === 1 ? playersWithCards[0] : null;
            const winners = game.playerOrder.map(id => game.players[id]).filter(p => p && p.cards.length === 0);
            game.winner = { winners, loser };
            return true;
        }
    }
    return false;
}

module.exports = {
    RANK_VALUES,
    createDeck,
    canBeat,
    getNextPlayerIndex,
    updateTurn,
    checkGameOver
};
