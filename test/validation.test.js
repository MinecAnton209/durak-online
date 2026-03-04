import { describe, it, expect } from 'vitest';
import {
    validateUsername,
    validatePassword,
    validateGameId,
    validateCard,
    validateLobbySettings,
} from '../utils/validation';

describe('validateUsername', () => {
    it('accepts valid names', () => {
        expect(validateUsername('john_doe').valid).toBe(true);
        expect(validateUsername('abc').valid).toBe(true);
        expect(validateUsername('exactly20Characters_').valid).toBe(true);
    });
    it('rejects too short', () => expect(validateUsername('ab').valid).toBe(false));
    it('rejects too long', () => expect(validateUsername('a'.repeat(21)).valid).toBe(false));
    it('rejects special chars', () => expect(validateUsername('hello!').valid).toBe(false));
    it('rejects null', () => expect(validateUsername(null).valid).toBe(false));
    it('rejects empty string', () => expect(validateUsername('').valid).toBe(false));
    it('trims and validates', () => expect(validateUsername('  hello  ').valid).toBe(true));
});

describe('validatePassword', () => {
    it('accepts valid passwords', () => {
        expect(validatePassword('password123').valid).toBe(true);
        expect(validatePassword('12345678').valid).toBe(true);
        expect(validatePassword('onlyletters').valid).toBe(true);
    });
    it('rejects too short (< 6 chars)', () => expect(validatePassword('abc').valid).toBe(false));
    it('rejects null', () => expect(validatePassword(null).valid).toBe(false));
});

describe('validateGameId', () => {
    it('accepts 6-char hex uppercase', () => {
        expect(validateGameId('A1B2C3').valid).toBe(true);
        expect(validateGameId('FFFFFF').valid).toBe(true);
        expect(validateGameId('000000').valid).toBe(true);
    });
    it('rejects wrong length', () => {
        expect(validateGameId('A1B2C').valid).toBe(false);
        expect(validateGameId('A1B2C3D').valid).toBe(false);
    });
    it('rejects invalid chars', () => expect(validateGameId('A1B2CG').valid).toBe(false));
    it('rejects null', () => expect(validateGameId(null).valid).toBe(false));
});

describe('validateCard', () => {
    const validSuits = ['♦', '♥', '♠', '♣'];
    const validRanks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3', '4', '5'];

    it('accepts all valid suit/rank combos', () => {
        for (const suit of validSuits) {
            expect(validateCard({ rank: 'A', suit }).valid).toBe(true);
        }
        for (const rank of validRanks) {
            expect(validateCard({ rank, suit: '♦' }).valid).toBe(true);
        }
    });
    it('rejects invalid rank', () => expect(validateCard({ rank: '1', suit: '♦' }).valid).toBe(false));
    it('rejects invalid suit', () => expect(validateCard({ rank: 'A', suit: 'X' }).valid).toBe(false));
    it('rejects null', () => expect(validateCard(null).valid).toBe(false));
    it('rejects empty object', () => expect(validateCard({}).valid).toBe(false));
});

describe('validateLobbySettings', () => {
    const base = () => ({
        maxPlayers: 4,
        betAmount: 0,
        deckSize: 36,
        turnDuration: 60,
        lobbyType: 'public',
        gameMode: 'podkidnoy'
    });

    it('accepts valid settings', () => {
        const r = validateLobbySettings(base());
        expect(r.valid).toBe(true);
        expect(r.sanitized.maxPlayers).toBe(4);
    });
    it('coerces string numbers', () => {
        const r = validateLobbySettings({ ...base(), maxPlayers: '2', deckSize: '24', turnDuration: '30' });
        expect(r.valid).toBe(true);
        expect(r.sanitized.maxPlayers).toBe(2);
        expect(r.sanitized.deckSize).toBe(24);
    });
    it('rejects maxPlayers > 6', () => expect(validateLobbySettings({ ...base(), maxPlayers: 7 }).valid).toBe(false));
    it('rejects invalid deckSize', () => expect(validateLobbySettings({ ...base(), deckSize: 40 }).valid).toBe(false));
    it('rejects turnDuration too short', () => expect(validateLobbySettings({ ...base(), turnDuration: 5 }).valid).toBe(false));
    it('rejects invalid gameMode', () => expect(validateLobbySettings({ ...base(), gameMode: 'fakemode' }).valid).toBe(false));
    it('rejects invalid lobbyType', () => expect(validateLobbySettings({ ...base(), lobbyType: 'secret' }).valid).toBe(false));
    it('accepts perevodnoy mode', () => expect(validateLobbySettings({ ...base(), gameMode: 'perevodnoy' }).valid).toBe(true));
    it('accepts private lobby', () => expect(validateLobbySettings({ ...base(), lobbyType: 'private' }).valid).toBe(true));
});
