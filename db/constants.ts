/**
 * Sentinel password values for accounts created via Telegram login
 * (no real password set — auth is delegated to Telegram). Used by
 * services/telegramBot.ts and any other consumer that needs to know
 * whether a row has full credentials.
 */
export const TELEGRAM_ONLY_PASSWORDS = ['telegram_user', 'telegram_user_widget'] as const;
