/**
 * Security utilities for input validation and sanitization
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML insertion
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return '';

    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {object} {valid: boolean, error: string}
 */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
        return { valid: false, error: 'Username must be between 3 and 20 characters' };
    }

    // Only alphanumeric and underscore allowed
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    return { valid: true, value: trimmed };
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} {valid: boolean, error: string}
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }

    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    // Must contain at least one letter and one number
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
        return { valid: false, error: 'Password must contain at least one letter and one number' };
    }

    return { valid: true };
}

/**
 * Validate game ID format (6-character uppercase hex)
 * @param {string} gameId - Game ID to validate
 * @returns {object} {valid: boolean, error: string}
 */
function validateGameId(gameId) {
    if (!gameId || typeof gameId !== 'string') {
        return { valid: false, error: 'Game ID is required' };
    }

    const upper = gameId.toUpperCase();

    if (!/^[A-F0-9]{6}$/.test(upper)) {
        return { valid: false, error: 'Invalid game ID format' };
    }

    return { valid: true, value: upper };
}

/**
 * Validate card object
 * @param {object} card - Card object to validate
 * @returns {object} {valid: boolean, error: string}
 */
function validateCard(card) {
    if (!card || typeof card !== 'object') {
        return { valid: false, error: 'Invalid card object' };
    }

    const validRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const validSuits = ['♦', '♥', '♠', '♣'];

    if (!validRanks.includes(card.rank)) {
        return { valid: false, error: 'Invalid card rank' };
    }

    if (!validSuits.includes(card.suit)) {
        return { valid: false, error: 'Invalid card suit' };
    }

    return { valid: true };
}

/**
 * Validate lobby settings
 * @param {object} settings - Lobby settings to validate
 * @returns {object} {valid: boolean, error: string, sanitized: object}
 */
function validateLobbySettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return { valid: false, error: 'Invalid settings object' };
    }

    const sanitized = {};

    // maxPlayers: 2-6 only
    const maxPlayers = parseInt(settings.maxPlayers, 10);
    if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 6) {
        return { valid: false, error: 'Max players must be between 2 and 6' };
    }
    sanitized.maxPlayers = maxPlayers;

    // betAmount: 0-10000 range
    const betAmount = parseInt(settings.betAmount, 10) || 0;
    if (isNaN(betAmount) || betAmount < 0 || betAmount > 10000) {
        return { valid: false, error: 'Bet amount must be between 0 and 10000' };
    }
    sanitized.betAmount = betAmount;

    // deckSize: 24, 36, or 52 only
    const deckSize = parseInt(settings.deckSize, 10);
    if (![24, 36, 52].includes(deckSize)) {
        return { valid: false, error: 'Deck size must be 24, 36, or 52' };
    }
    sanitized.deckSize = deckSize;

    // turnDuration: 0, 15-300 seconds
    const turnDuration = parseInt(settings.turnDuration, 10);
    if (isNaN(turnDuration) || (turnDuration !== 0 && (turnDuration < 15 || turnDuration > 300))) {
        return { valid: false, error: 'Turn duration must be 0 (unlimited) or between 15 and 300 seconds' };
    }
    sanitized.turnDuration = turnDuration;

    // lobbyType: 'public' or 'private' only
    if (!['public', 'private'].includes(settings.lobbyType)) {
        return { valid: false, error: 'Lobby type must be "public" or "private"' };
    }
    sanitized.lobbyType = settings.lobbyType;

    // gameMode: 'podkidnoy' or 'perevodnoy' only
    if (!['podkidnoy', 'perevodnoy'].includes(settings.gameMode)) {
        return { valid: false, error: 'Game mode must be "podkidnoy" or "perevodnoy"' };
    }
    sanitized.gameMode = settings.gameMode;

    return { valid: true, sanitized };
}

/**
 * Validate roulette bet
 * @param {object} bet - Bet object to validate
 * @returns {object} {valid: boolean, error: string}
 */
function validateRouletteBet(bet) {
    if (!bet || typeof bet !== 'object') {
        return { valid: false, error: 'Invalid bet object' };
    }

    const amount = parseInt(bet.amount, 10);
    if (isNaN(amount) || amount <= 0 || amount > 10000) {
        return { valid: false, error: 'Bet amount must be between 1 and 10000' };
    }

    const validTypes = ['number', 'color', 'even-odd'];
    if (!validTypes.includes(bet.type)) {
        return { valid: false, error: 'Invalid bet type' };
    }

    // Validate bet value based on type
    if (bet.type === 'number') {
        const num = parseInt(bet.value, 10);
        if (isNaN(num) || num < 0 || num > 36) {
            return { valid: false, error: 'Number must be between 0 and 36' };
        }
    } else if (bet.type === 'color') {
        if (!['red', 'black'].includes(bet.value)) {
            return { valid: false, error: 'Color must be "red" or "black"' };
        }
    } else if (bet.type === 'even-odd') {
        if (!['even', 'odd'].includes(bet.value)) {
            return { valid: false, error: 'Even/Odd must be "even" or "odd"' };
        }
    }

    return { valid: true };
}

module.exports = {
    escapeHtml,
    validateUsername,
    validatePassword,
    validateGameId,
    validateCard,
    validateLobbySettings,
    validateRouletteBet
};
