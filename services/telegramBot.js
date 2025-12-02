const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const locales = require('./locales');
const db = require('../db');
const friendsDb = require('../db/friends');
const util = require('util');
const bcrypt = require('bcryptjs');

let bot = null;
const APP_URL = 'https://t.me/durakthebot/durak';

const dbGet = db.get.constructor.name === 'AsyncFunction' ? db.get : util.promisify(db.get.bind(db));
const dbRun = db.run.constructor.name === 'AsyncFunction' ? db.run : util.promisify(db.run.bind(db));
const dbAll = db.all.constructor.name === 'AsyncFunction' ? db.all : util.promisify(db.all.bind(db));

const userStates = {};

function t(langCode, key, params = {}) {
    const lang = (langCode && langCode.split('-')[0]) || 'en';
    const selectedLang = locales[lang] || locales['en'];
    const keys = key.split('.');
    let value = selectedLang;
    for (const k of keys) {
        value = value && value[k];
    }
    if (!value) return key;
    return value.replace(/{(\w+)}/g, (_, v) => params[v] !== undefined ? params[v] : `{${v}}`);
}

function isTelegramOnly(passwordHash) {
    return passwordHash === 'telegram_user' || passwordHash === 'telegram_user_widget';
}

async function showMainMenu(ctx, isEdit = false) {
    const lang = ctx.from.language_code;
    const text = t(lang, 'welcome', { name: ctx.from.first_name });

    const keyboard = [
        [{ text: t(lang, 'play_btn'), url: APP_URL }],
        [
            { text: t(lang, 'profile.btn_open'), callback_data: 'profile' },
            { text: t(lang, 'btn_friends'), callback_data: 'friends_menu' }
        ],
        [
            { text: t(lang, 'btn_leaderboard'), callback_data: 'leaderboard_rating' },
            { text: t(lang, 'btn_donate'), callback_data: 'donate_start' }
        ],
        [{ text: t(lang, 'add_group_btn'), url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }]
    ];

    const markup = { inline_keyboard: keyboard };

    try {
        if (isEdit) await ctx.editMessageText(text, { reply_markup: markup }).catch(() => { });
        else await ctx.reply(text, { reply_markup: markup });
    } catch (e) { console.error("MainMenu Error:", e); }
}

function init(token) {
    if (!token) return console.warn("⚠️ TELEGRAM_BOT_TOKEN не задан.");
    bot = new Telegraf(token);

    bot.start(async (ctx) => showMainMenu(ctx));
    bot.help((ctx) => ctx.reply(t(ctx.from.language_code, 'help', { botname: ctx.botInfo.username })));

    bot.action('main_menu', async (ctx) => {
        await ctx.answerCbQuery();
        await showMainMenu(ctx, true);
    });

    bot.command('profile', async (ctx) => showProfile(ctx));
    bot.action('profile', async (ctx) => {
        await ctx.answerCbQuery();
        await showProfile(ctx, true);
    });

    async function showProfile(ctx, isEdit = false) {
        const lang = ctx.from.language_code;
        const telegramId = ctx.from.id;
        try {
            const user = await dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
            if (!user) return ctx.reply(t(lang, 'errors.no_account'));

            const isTgOnly = isTelegramOnly(user.password);
            const statusText = isTgOnly ? t(lang, 'profile.status_tg_only') : t(lang, 'profile.status_full');
            const passBtnText = isTgOnly ? t(lang, 'profile.btn_set_pass') : t(lang, 'profile.btn_change_pass');

            const text = t(lang, 'profile.caption', {
                id: user.id, username: user.username, account_status: statusText,
                wins: user.wins || 0, losses: user.losses || 0, rating: user.rating || 1500, coins: user.coins || 0
            });

            const keyboard = {
                inline_keyboard: [
                    [{ text: t(lang, 'profile.btn_edit_nick'), callback_data: 'edit_nick' }, { text: passBtnText, callback_data: 'edit_pass' }],
                    [{ text: t(lang, 'profile.btn_refresh'), callback_data: 'profile' }, { text: t(lang, 'buttons.back_to_menu'), callback_data: 'main_menu' }],
                    [{ text: t(lang, 'play_btn'), url: APP_URL }]
                ]
            };

            if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => { });
            else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (e) { console.error(e); }
    }

    bot.action('edit_nick', async (ctx) => {
        const lang = ctx.from.language_code;
        userStates[ctx.from.id] = { action: 'awaiting_nick' };
        await ctx.answerCbQuery();
        await ctx.reply(t(lang, 'profile.enter_new_nick'), {
            reply_markup: { keyboard: [[{ text: t(lang, 'buttons.cancel') }]], resize_keyboard: true, one_time_keyboard: true }
        });
    });

    bot.action('edit_pass', async (ctx) => {
        const lang = ctx.from.language_code;
        const userId = ctx.from.id;
        try {
            const user = await dbGet('SELECT password FROM users WHERE telegram_id = ?', [userId]);
            if (isTelegramOnly(user.password)) {
                userStates[userId] = { action: 'awaiting_new_pass' };
                await ctx.reply(t(lang, 'profile.enter_new_pass'), {
                    parse_mode: 'Markdown',
                    reply_markup: { keyboard: [[{ text: t(lang, 'buttons.cancel') }]], resize_keyboard: true, one_time_keyboard: true }
                });
            } else {
                userStates[userId] = { action: 'awaiting_old_pass' };
                await ctx.reply(t(lang, 'profile.enter_old_pass'), {
                    parse_mode: 'Markdown',
                    reply_markup: { keyboard: [[{ text: t(lang, 'buttons.cancel') }]], resize_keyboard: true, one_time_keyboard: true }
                });
            }
            await ctx.answerCbQuery();
        } catch (e) { console.error(e); }
    });

    bot.command('friends', async (ctx) => showFriendsMenu(ctx, false));

    bot.action('friends_menu', async (ctx) => {
        await ctx.answerCbQuery();
        await showFriendsMenu(ctx, true);
    });
    async function showFriendsMenu(ctx, isEdit = false) {
        const lang = ctx.from.language_code;
        const telegramId = ctx.from.id;
        try {
            const user = await dbGet('SELECT id, username FROM users WHERE telegram_id = ?', [telegramId]);
            if (!user) {
                const msg = t(lang, 'errors.user_not_found');
                return isEdit ? ctx.answerCbQuery(msg) : ctx.reply(msg);
            }

            const { accepted, incoming } = await friendsDb.getFriendships(user.id);
            const text = t(lang, 'friends.caption', { count: accepted.length, requests: incoming.length });

            const keyboard = [
                incoming.length > 0 ? [{ text: t(lang, 'friends.btn_requests', { count: incoming.length }), callback_data: 'friends_requests' }] : [],
                [{ text: t(lang, 'friends.btn_add'), switch_inline_query: "" }],
                [{ text: t(lang, 'buttons.back_to_menu'), callback_data: 'main_menu' }]
            ];

            let friendListText = "";
            if (accepted.length > 0) {
                friendListText = "\n\n" + accepted.slice(0, 10).map((f, i) => {
                    const safeNick = f.nickname.replace(/[_*[`]/g, '\\$&');
                    return `${i + 1}. 👤 **${safeNick}** (${f.rating}⭐)`;
                }).join('\n');
                if (accepted.length > 10) friendListText += "\n...";
            } else {
                friendListText = "\n\n_" + t(lang, 'friends.list_empty') + "_";
            }

            const inviteLink = `https://t.me/${ctx.botInfo.username}?start=invite\\_${user.id}`;
            const footer = `\n\n${t(lang, 'friends.invite_link', { link: inviteLink })}`;

            const fullText = text + friendListText + footer;
            const markup = { inline_keyboard: keyboard.filter(row => row.length > 0) };

            if (isEdit) {
                await ctx.editMessageText(fullText, { parse_mode: 'Markdown', reply_markup: markup }).catch(() => { });
            } else {
                await ctx.reply(fullText, { parse_mode: 'Markdown', reply_markup: markup });
            }

        } catch (e) {
            console.error(e);
            if (isEdit) ctx.answerCbQuery('Error');
        }
    }

    bot.action('friends_requests', async (ctx) => {
        const lang = ctx.from.language_code;
        const telegramId = ctx.from.id;
        try {
            const user = await dbGet('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
            const { incoming } = await friendsDb.getFriendships(user.id);
            if (incoming.length === 0) { await ctx.answerCbQuery('No requests'); return showFriendsMenu(ctx); }

            const request = incoming[0];
            const safeNick = request.nickname.replace(/[_*[`]/g, '\\$&');
            const text = t(lang, 'friends.incoming_request', { username: safeNick });
            const keyboard = [
                [{ text: t(lang, 'friends.btn_accept'), callback_data: `friend_accept_${request.id}` }, { text: t(lang, 'friends.btn_decline'), callback_data: `friend_decline_${request.id}` }],
                [{ text: t(lang, 'buttons.cancel'), callback_data: 'friends_menu' }]
            ];
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (e) { console.error(e); }
    });

    bot.action(/friend_(accept|decline)_(\d+)/, async (ctx) => {
        const lang = ctx.from.language_code;
        const action = ctx.match[1];
        const friendId = parseInt(ctx.match[2]);
        const telegramId = ctx.from.id;
        try {
            const user = await dbGet('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
            const friendUser = await dbGet('SELECT username FROM users WHERE id = ?', [friendId]);
            if (action === 'accept') {
                await friendsDb.updateFriendshipStatus(user.id, friendId, 'accepted', user.id);
                await ctx.answerCbQuery(t(lang, 'friends.accepted', { username: friendUser?.username || 'User' }));
            } else {
                await friendsDb.removeFriendship(user.id, friendId);
                await ctx.answerCbQuery(t(lang, 'friends.declined'));
            }
            showFriendsMenu(ctx);
        } catch (e) { console.error(e); ctx.answerCbQuery('Error'); }
    });

    bot.command('leaderboard', async (ctx) => showLeaderboard(ctx, 'rating', false));

    bot.action(/leaderboard_(rating|wins)/, async (ctx) => {
        const type = ctx.match[1];
        await ctx.answerCbQuery();
        showLeaderboard(ctx, type, true);
    });

    async function showLeaderboard(ctx, type = 'rating', isEdit = false) {
        const lang = ctx.from.language_code;
        const limit = 10;
        try {
            const orderBy = type === 'rating' ? 'rating' : 'wins';
            const sql = `SELECT username, rating, wins, is_verified FROM users WHERE is_banned = FALSE ORDER BY ${orderBy} DESC LIMIT ?`;
            const rows = await dbAll(sql, [limit]);

            if (!rows.length) {
                const msg = t(lang, 'leaderboard.empty');
                return isEdit ? ctx.answerCbQuery(msg) : ctx.reply(msg);
            }

            let text = t(lang, 'leaderboard.caption', { limit }) + "\n\n";
            rows.forEach((row, index) => {
                let icon = '👤';
                if (index === 0) icon = '🥇'; if (index === 1) icon = '🥈'; if (index === 2) icon = '🥉';
                if (row.is_verified) icon += '☑️';
                const score = type === 'rating' ? `${row.rating} ⭐` : `${row.wins} 🏅`;
                const safeNick = row.username.replace(/[_*[`]/g, '\\$&');
                text += t(lang, 'leaderboard.format', { rank: index + 1, icon, username: safeNick, score }) + "\n";
            });

            const keyboard = [
                [
                    { text: t(lang, 'leaderboard.btn_rating') + (type === 'rating' ? ' ✅' : ''), callback_data: 'leaderboard_rating' },
                    { text: t(lang, 'leaderboard.btn_wins') + (type === 'wins' ? ' ✅' : ''), callback_data: 'leaderboard_wins' }
                ],
                [{ text: t(lang, 'buttons.back_to_menu'), callback_data: 'main_menu' }]
            ];

            const markup = { inline_keyboard: keyboard };

            if (isEdit) {
                await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup }).catch(() => { });
            } else {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
            }

        } catch (e) {
            console.error(e);
            if (isEdit) ctx.answerCbQuery('Db Error');
        }
    }

    const askForDonation = async (ctx) => {
        const lang = ctx.from.language_code;
        userStates[ctx.from.id] = { action: 'awaiting_donation_amount' };
        await ctx.reply(t(lang, 'donate.ask_amount'), {
            parse_mode: 'Markdown',
            reply_markup: { keyboard: [[{ text: t(lang, 'buttons.cancel') }]], resize_keyboard: true, one_time_keyboard: true }
        });
    };
    bot.command('donate', askForDonation);
    bot.action('donate_start', async (ctx) => {
        await ctx.answerCbQuery();
        await askForDonation(ctx);
    });

    bot.command('createroom', async (ctx) => {
        const lang = ctx.from.language_code;
        const telegramId = ctx.from.id;
        try {
            const user = await dbGet('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
            if (!user) return ctx.reply(t(lang, 'errors.no_account'));

            const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
            const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
            const rawText = ctx.message?.text || '';
            const lowerText = rawText.toLowerCase();
            const isTransferMode = lowerText.includes('perevod') || lowerText.includes('перевод') || lowerText.includes('transfer');
            const lobbySettings = { maxPlayers: 4, lobbyType: 'private', gameMode: isTransferMode ? 'perevodnoy' : 'podkidnoy', betAmount: 0, deckSize: 36 };

            await dbRun(`INSERT INTO games (id, status, lobby_type, invite_code, max_players, host_user_id, game_settings, start_time) VALUES (?, 'waiting', ?, ?, ?, ?, ?, ?)`,
                [gameId, 'private', inviteCode, lobbySettings.maxPlayers, user.id, JSON.stringify(lobbySettings), new Date().toISOString()]);

            setTimeout(async () => {
                const game = await dbGet("SELECT status FROM games WHERE id = ?", [gameId]);
                if (game && game.status === 'waiting') {
                    await dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [gameId]);
                    ctx.telegram.sendMessage(telegramId, t(lang, 'bot.lobby_expired', { id: gameId }));
                }
            }, 300000);

            const joinLink = `https://t.me/${ctx.botInfo.username}/durak?startapp=${gameId}`;
            const message = t(lang, 'bot.lobby_created', { id: gameId, code: inviteCode });
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: t(lang, 'bot.join_link_btn'), url: joinLink }]] }
            });
        } catch (e) { console.error(e); ctx.reply(t(lang, 'bot.create_error')); }
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const state = userStates[userId];
        const lang = ctx.from.language_code;
        const text = ctx.message.text;

        if (!state) return;

        if (text === t(lang, 'buttons.cancel')) {
            delete userStates[userId];
            return ctx.reply(t(lang, 'profile.cancel'), { reply_markup: { remove_keyboard: true } });
        }

        if (state.action === 'awaiting_nick') {
            if (text.length < 3 || text.length > 15 || !/^[a-zA-Z0-9_]+$/.test(text)) return ctx.reply(t(lang, 'profile.error_format'));
            try {
                const existing = await dbGet('SELECT id FROM users WHERE username = ?', [text]);
                if (existing) return ctx.reply(t(lang, 'profile.error_nick_taken'));
                await dbRun('UPDATE users SET username = ? WHERE telegram_id = ?', [text, userId]);
                delete userStates[userId];
                await ctx.reply(t(lang, 'profile.nick_updated', { username: text }), { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
                showProfile(ctx);
            } catch (e) { ctx.reply(t(lang, 'profile.error_db')); }
        }

        else if (state.action === 'awaiting_old_pass') {
            try { await ctx.deleteMessage(); } catch (e) { }
            try {
                const user = await dbGet('SELECT password FROM users WHERE telegram_id = ?', [userId]);
                const isMatch = await bcrypt.compare(text, user.password);
                if (!isMatch) {
                    const msg = await ctx.reply(t(lang, 'profile.error_wrong_pass'));
                    setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { }), 3000);
                    return;
                }
                userStates[userId] = { action: 'awaiting_new_pass' };
                await ctx.reply(t(lang, 'profile.enter_new_pass'), { parse_mode: 'Markdown' });
            } catch (e) { console.error(e); }
        }

        else if (state.action === 'awaiting_new_pass') {
            try { await ctx.deleteMessage(); } catch (e) { }
            if (text.length < 4 || text.length > 30) {
                const msg = await ctx.reply(t(lang, 'profile.error_format'));
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { }), 3000);
                return;
            }
            try {
                const hashedPassword = await bcrypt.hash(text, 10);
                await dbRun('UPDATE users SET password = ? WHERE telegram_id = ?', [hashedPassword, userId]);
                delete userStates[userId];
                const msg = await ctx.reply(t(lang, 'profile.pass_set_success'), { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { }), 3000);
                showProfile(ctx);
            } catch (e) { ctx.reply(t(lang, 'profile.error_db')); }
        }

        else if (state.action === 'awaiting_donation_amount') {
            const amount = parseInt(text);
            if (isNaN(amount) || amount < 1) return ctx.reply(t(lang, 'donate.error_amount'));
            if (amount > 2500) return ctx.reply(t(lang, 'donate.error_too_big'));
            delete userStates[userId];
            const tempMsg = await ctx.reply("⏳", { reply_markup: { remove_keyboard: true } });
            try { await ctx.deleteMessage(tempMsg.message_id); } catch (e) { }
            return ctx.sendInvoice({
                chat_id: ctx.chat.id,
                title: t(lang, 'donate.title'),
                description: t(lang, 'donate.description'),
                payload: `donation_${userId}_${Date.now()}`,
                provider_token: "",
                currency: "XTR",
                prices: [{ label: t(lang, 'donate.label'), amount: amount }],
                start_parameter: "donation"
            });
        }
    });

    bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
    bot.on('successful_payment', async (ctx) => {
        const lang = ctx.from.language_code;
        const payment = ctx.message.successful_payment;
        try {
            const user = await dbGet('SELECT id FROM users WHERE telegram_id = ?', [ctx.from.id]);
            if (user) {
                await dbRun('INSERT INTO donations (user_id, telegram_payment_charge_id, amount) VALUES (?, ?, ?)',
                    [user.id, payment.telegram_payment_charge_id, payment.total_amount]);
            }
            await ctx.reply(t(lang, 'donate.success', { amount: payment.total_amount }), { parse_mode: 'Markdown' });
        } catch (e) { console.error(e); }
    });

    bot.on('inline_query', async (ctx) => {
        try {
            const lang = ctx.from.language_code;
            const telegramId = ctx.from.id;
            const user = await dbGet('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);

            const results = [{
                type: 'article', id: 'play_game',
                title: t(lang, 'inline.title'), description: t(lang, 'inline.desc'),
                thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/8002/8002169.png',
                input_message_content: { message_text: t(lang, 'inline.message') },
                reply_markup: { inline_keyboard: [[{ text: t(lang, 'inline.button'), url: APP_URL }]] }
            }];

            if (user) {
                results.push({
                    type: 'article', id: 'create_private_lobby',
                    title: t(lang, 'inline.create_lobby_title'), description: t(lang, 'inline.create_lobby_desc'),
                    thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3039/3039386.png',
                    input_message_content: { message_text: t(lang, 'inline.lobby_invite_message') },
                    reply_markup: {
                        inline_keyboard: [[
                            { text: t(lang, 'inline.create_podkidnoy_btn'), callback_data: `create_lobby_inline_podkidnoy_${user.id}` },
                            { text: t(lang, 'inline.create_perevodnoy_btn'), callback_data: `create_lobby_inline_perevodnoy_${user.id}` }
                        ]]
                    }
                });
            }
            await ctx.answerInlineQuery(results, { cache_time: 0 });
        } catch (err) { console.error('Inline Query Error:', err); }
    });

    bot.action(/create_lobby_inline_(podkidnoy|perevodnoy)_(\d+)/, async (ctx) => {
        const lang = ctx.from.language_code;
        const mode = ctx.match[1];
        const hostUserId = parseInt(ctx.match[2]);

        try {
            const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
            const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

            const lobbySettings = {
                maxPlayers: 4,
                lobbyType: 'private',
                deckSize: 36,
                gameMode: mode,
                betAmount: 0
            };

            await dbRun(`INSERT INTO games (id, status, lobby_type, invite_code, max_players, host_user_id, game_settings, start_time) VALUES (?, 'waiting', ?, ?, ?, ?, ?, ?)`,
                [gameId, 'private', inviteCode, lobbySettings.maxPlayers, hostUserId, JSON.stringify(lobbySettings), new Date().toISOString()]);

            const joinLink = `https://t.me/${ctx.botInfo.username}/durak?startapp=${gameId}`;

            await ctx.editMessageReplyMarkup({
                inline_keyboard: [[{ text: t(ctx.from.language_code, 'inline.lobby_join_button'), url: joinLink }]]
            });

            await ctx.answerCbQuery(t(lang, 'bot.lobby_created', { id: gameId, code: inviteCode }).split('\n')[0]);

        } catch (e) {
            console.error("Error creating inline lobby:", e);
            ctx.answerCbQuery(t(lang, 'bot.create_error'));
        }
    });

    bot.launch({ dropPendingUpdates: true }).then(() => console.log('🤖 Telegram Bot Started!'))
        .catch(err => console.error('Bot launch error:', err));
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = { init };
