import { z } from 'zod';

function escapeHtml(text: string): string {
    if (typeof text !== 'string') return '';

    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => map[char] ?? char);
}

const usernameSchema = z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

function validateUsername(username: unknown): { valid: boolean; error?: string; value?: string } {
    if (typeof username !== 'string') return { valid: false, error: 'Username is required' };
    const result = usernameSchema.safeParse(username.trim());
    if (!result.success) return { valid: false, error: result.error.issues[0]?.message ?? "Validation error" };
    return { valid: true, value: result.data };
}

const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters long');

function validatePassword(password: unknown): { valid: boolean; error?: string } {
    if (typeof password !== 'string') return { valid: false, error: 'Password is required' };
    const result = passwordSchema.safeParse(password);
    if (!result.success) return { valid: false, error: result.error.issues[0]?.message ?? "Validation error" };
    return { valid: true };
}

const gameIdSchema = z.string()
    .length(6, 'Invalid game ID format')
    .regex(/^[A-F0-9]{6}$/, 'Invalid game ID format');

function validateGameId(gameId: unknown): { valid: boolean; error?: string; value?: string } {
    if (typeof gameId !== 'string') return { valid: false, error: 'Game ID is required' };
    const result = gameIdSchema.safeParse(gameId.toUpperCase());
    if (!result.success) return { valid: false, error: result.error.issues[0]?.message ?? "Validation error" };
    return { valid: true, value: result.data };
}

const cardSchema = z.object({
    rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'], { error: () => ({ message: 'Invalid card rank' }) }),
    suit: z.enum(['♦', '♥', '♠', '♣'], { error: () => ({ message: 'Invalid card suit' }) })
});

function validateCard(card: unknown): { valid: boolean; error?: string } {
    if (!card || typeof card !== 'object') return { valid: false, error: 'Invalid card object' };
    const result = cardSchema.safeParse(card);
    if (!result.success) return { valid: false, error: result.error.issues[0]?.message ?? "Validation error" };
    return { valid: true };
}

const lobbySettingsSchema = z.object({
    maxPlayers: z.coerce.number().int().min(2).max(6),
    betAmount: z.coerce.number().int().min(0).max(10000).optional().default(0),
    deckSize: z.coerce.number().int().refine(val => [24, 36, 52].includes(val), { message: 'Deck size must be 24, 36, or 52' }),
    turnDuration: z.coerce.number().int().refine(val => val === 0 || (val >= 15 && val <= 300), { message: 'Turn duration must be 0 (unlimited) or between 15 and 300 seconds' }),
    lobbyType: z.enum(['public', 'private']),
    gameMode: z.enum(['podkidnoy', 'perevodnoy'])
});

function validateLobbySettings(settings: unknown): { valid: boolean; error?: string; sanitized?: any } {
    if (!settings || typeof settings !== 'object') {
        return { valid: false, error: 'Invalid settings object' };
    }
    const result = lobbySettingsSchema.safeParse(settings);
    if (!result.success) return { valid: false, error: result.error.issues[0]?.message ?? "Validation error" };
    return { valid: true, sanitized: result.data };
}

const rouletteBetSchema = z.object({
    amount: z.coerce.number().int().min(1).max(10000),
    type: z.enum(['number', 'color', 'even-odd']),
    value: z.any()
}).superRefine((data, ctx) => {
    if (data.type === 'number') {
        const num = parseInt(data.value, 10);
        if (isNaN(num) || num < 0 || num > 36) {
            ctx.addIssue({ code: 'custom', message: 'Number must be between 0 and 36', path: ['value'] });
        }
    } else if (data.type === 'color') {
        if (!['red', 'black'].includes(data.value as string)) {
            ctx.addIssue({ code: 'custom', message: 'Color must be "red" or "black"', path: ['value'] });
        }
    } else if (data.type === 'even-odd') {
        if (!['even', 'odd'].includes(data.value as string)) {
            ctx.addIssue({ code: 'custom', message: 'Even/Odd must be "even" or "odd"', path: ['value'] });
        }
    }
});

function validateRouletteBet(bet: unknown): { valid: boolean; error?: string } {
    if (!bet || typeof bet !== 'object') return { valid: false, error: 'Invalid bet object' };
    const result = rouletteBetSchema.safeParse(bet);
    if (!result.success) return { valid: false, error: result.error.issues[0]?.message ?? "Validation error" };
    return { valid: true };
}

export {
    escapeHtml,
    validateUsername,
    validatePassword,
    validateGameId,
    validateCard,
    validateLobbySettings,
    validateRouletteBet
};
