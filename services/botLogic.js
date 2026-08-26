const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function getCardValue(card, trumpSuit) {
    if (!card) return 0;
    let val = RANK_VALUES[card.rank];
    if (card.suit === trumpSuit) val += 20; // Козыри всегда дороже
    return val;
}

function canBeat(attackCard, defendCard, trumpSuit) {
    if (!attackCard || !defendCard) return false; // Защита от null

    if (attackCard.suit === defendCard.suit) {
        return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank];
    }
    return defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit;
}

// Слабые -> сильные, козыри всегда в хвосте (их ценность выше на 20).
function sortByValue(cards, trumpSuit) {
    return [...cards].sort((a, b) => getCardValue(a, trumpSuit) - getCardValue(b, trumpSuit));
}

function getBotMove(game, botPlayer) {
    const difficulty = botPlayer.difficulty || 'medium';
    const isDefender = game.defenderId === botPlayer.id;
    const isAttacker = game.attackerId === botPlayer.id || game.turn === botPlayer.id;

    // === ЗАДЕРЖКА (Имитация раздумий) ===
    // Возвращаем задержку, чтобы бот не ходил мгновенно (это бесит)
    let delay = Math.random() * 1000 + 1000; // 1-2 сек
    if (difficulty === 'child') delay = 3000; // Ребенок тупит
    if (difficulty === 'impossible') delay = 500; // Терминатор думает быстро

    // === ЛОГИКА ВЫБОРА ХОДА ===
    let action = null; // { type: 'move'|'take'|'pass', card: ... }

    if (isDefender) {
        action = getDefenseMove(game, botPlayer, difficulty);
    } else {
        action = getAttackMove(game, botPlayer, difficulty);
    }

    return { action, delay };
}

// --- ЛОГИКА ЗАЩИТЫ ---
function getDefenseMove(game, bot, diff) {
    const attackCard = game.table[game.table.length - 1];

    // 1. Находим все карты, которыми можно побить
    let possibleMoves = bot.cards.filter(c => canBeat(attackCard, c, game.trumpSuit));

    // Сортируем от слабых к сильным
    possibleMoves.sort((a, b) => getCardValue(a, game.trumpSuit) - getCardValue(b, game.trumpSuit));

    if (possibleMoves.length === 0) {
        return { type: 'take' };
    }

    // === СТРАТЕГИИ ЗАЩИТЫ ===

    if (diff === 'child') {
        // Ребенок: Берет первую попавшуюся карту, которая подходит (даже если это Туз козырной)
        const randomIdx = Math.floor(Math.random() * possibleMoves.length);
        return { type: 'move', card: possibleMoves[randomIdx] };
    }

    if (diff === 'beginner') {
        // Новичок: Бьет самой сильной картой (глупо, но бывает) с вероятностью 30%
        if (Math.random() < 0.3) return { type: 'move', card: possibleMoves[possibleMoves.length - 1] };
        return { type: 'move', card: possibleMoves[0] };
    }

    if (diff === 'easy') {
        // Легкий: Бьет самой слабой.
        return { type: 'move', card: possibleMoves[0] };
    }

    if (diff === 'medium') {
        // Бьёт самой слабой подходящей картой (тратит ресурс по необходимости).
        return { type: 'move', card: possibleMoves[0] };
    }

    if (diff === 'hard' || diff === 'impossible') {
        // Сильный защитник: консервирует козырей.
        // 1. Бьёт не-козырной, если можем — козыря бережём.
        const nonTrumpMoves = possibleMoves.filter(c => c.suit !== game.trumpSuit);
        if (nonTrumpMoves.length > 0) {
            return { type: 'move', card: sortByValue(nonTrumpMoves, game.trumpSuit)[0] };
        }
        // 2. Побить можно только козырем. Если атака не-козырная и карт в руке
        //    мало, берём: сливать козыря на мелочь в конце партии — проигрыш.
        const mustBurnTrump = attackCard.suit !== game.trumpSuit;
        if (mustBurnTrump && bot.cards.length <= 2) {
            return { type: 'take' };
        }
        return { type: 'move', card: sortByValue(possibleMoves, game.trumpSuit)[0] };
    }

    return { type: 'take' };
}

// --- ЛОГИКА АТАКИ (И ПОДКИДЫВАНИЯ) ---
function getAttackMove(game, bot, diff) {
    // Какие ранги можно подкидывать?
    const tableRanks = game.table.map(c => c.rank);

    let validCards = [];
    if (game.table.length === 0) {
        validCards = [...bot.cards]; // Можно ходить любой
    } else {
        validCards = bot.cards.filter(c => tableRanks.includes(c.rank));
    }

    // Сортируем по ценности
    validCards.sort((a, b) => getCardValue(a, game.trumpSuit) - getCardValue(b, game.trumpSuit));

    if (validCards.length === 0) {
        return { type: 'pass' }; // Бито
    }

    // === СТРАТЕГИИ АТАКИ ===

    if (diff === 'child') {
        // Кидает случайную допустимую
        const randomIdx = Math.floor(Math.random() * validCards.length);
        return { type: 'move', card: validCards[randomIdx] };
    }

    if (diff === 'beginner') {
        // Ходит с самой крупной (не козырной), чтобы избавиться
        // Но подкидывает любую
        if (game.table.length === 0) {
            const nonTrumps = validCards.filter(c => c.suit !== game.trumpSuit);
            if (nonTrumps.length > 0) return { type: 'move', card: nonTrumps[nonTrumps.length - 1] };
        }
        return { type: 'move', card: validCards[0] };
    }

    if (diff === 'easy') {
        // Ходит с самой мелкой. Не кидает козыри, если есть обычные.
        return { type: 'move', card: validCards[0] };
    }

    if (diff === 'medium') {
        // Не кидает козыри в начале игры, если можно походить обычной
        const nonTrumps = validCards.filter(c => c.suit !== game.trumpSuit);
        if (nonTrumps.length > 0) return { type: 'move', card: nonTrumps[0] };
        return { type: 'move', card: validCards[0] };
    }

    if (diff === 'hard' || diff === 'impossible') {
        // Агрессивный, но грамотный: завал соперника, бережёт козырей.
        const defender = game.players[game.defenderId];
        const defenderLow = defender && defender.cards.length <= 2;

        const counts = {};
        bot.cards.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);

        // 1. Когда у защитника мало карт — давим парами, чтобы он не успел отбиться.
        //    Ищем парные ранги (свободные от козырей), которыми можно подкинуть.
        const pairs = validCards
            .filter(c => counts[c.rank] > 1 && c.suit !== game.trumpSuit)
            .sort((a, b) => getCardValue(a, game.trumpSuit) - getCardValue(b, game.trumpSuit));
        if (defenderLow && pairs.length > 0 && game.table.length % 2 === 0) {
            return { type: 'move', card: pairs[0] };
        }

        // 2. Не тратим козыря на пустом столе, если есть обычная карта.
        const nonTrump = validCards.filter(c => c.suit !== game.trumpSuit);
        const pool = (game.table.length === 0 && nonTrump.length > 0) ? nonTrump : validCards;

        // 3. В начале хода (пустой стол) предпочитаем парную карту для давления,
        //    иначе самую дешёвую, чтобы оставить старшие на потом.
        if (game.table.length === 0 && pairs.length > 0) {
            return { type: 'move', card: sortByValue(pairs, game.trumpSuit)[0] };
        }
        return { type: 'move', card: sortByValue(pool, game.trumpSuit)[0] };
    }

    return { type: 'pass' };
}

module.exports = { getBotMove };