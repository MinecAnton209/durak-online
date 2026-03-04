const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const locales = require('./locales');
const friendsDb = require('../db/friends');
const bcrypt = require('bcryptjs');
const prisma = require('../db/prisma');

let bot = null;
const APP_URL = 'https://t.me/durakthebot/durak';

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
            { text: t(lang, 'inbox.title'), callback_data: 'inbox_1' }
        ],
        [{ text: t(lang, 'btn_donate'), callback_data: 'donate_start' }],
        [{ text: t(lang, 'add_group_btn'), url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }]
    ];

    const markup = { inline_keyboard: keyboard };

    try {
        if (isEdit) await ctx.editMessageText(text, { reply_markup: markup }).catch(() => { });
        else await ctx.reply(text, { reply_markup: markup });
    } catch (e) { console.error('[TelegramBot] MainMenu error:', e); }
}

function init(token, getStatsCallback) {
    if (!token) return console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN not set.');
    bot = new Telegraf(token);

    bot.command('status', async (ctx) => {
        const lang = ctx.from.language_code;
        if (!getStatsCallback) return ctx.reply(t(lang, 'status.not_available'));
        const stats = await getStatsCallback();
        if (!stats) return ctx.reply(t(lang, 'status.error_fetch'));

        const msg = `
${t(lang, 'status.title')}

${t(lang, 'status.status', { status: stats.status })}
${t(lang, 'status.uptime', { uptime: stats.app.uptime })}
${t(lang, 'status.online', { online: stats.activity.users_online })}
${t(lang, 'status.games', { games: stats.activity.games_in_progress })}
${t(lang, 'status.players', { players: stats.activity.players_in_game })}
${t(lang, 'status.bots', { bots: stats.activity.bot_games_active })}

${t(lang, 'status.today_title')}
${t(lang, 'status.registrations', { count: stats.daily_stats.registrations_today })}
${t(lang, 'status.games_played', { count: stats.daily_stats.games_played_today })}

${t(lang, 'status.system_title')}
${t(lang, 'status.memory', { memory: stats.system.memory_rss })}
${t(lang, 'status.ping', { ping: stats.system.db_ping_ms })}
${t(lang, 'status.version', { version: stats.app.version })}
        `;
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

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

    bot.command('inbox', async (ctx) => showInbox(ctx, 1));
    bot.action(/inbox_(\d+)/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await ctx.answerCbQuery();
        await showInbox(ctx, page, true);
    });

    async function showProfile(ctx, isEdit = false) {
        const lang = ctx.from.language_code;
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId } });
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
        } catch (e) { console.error('[TelegramBot] showProfile error:', e); }
    }

    bot.action('edit_nick', async (ctx) => {
        const lang = ctx.from.language_code;

        if (ctx.chat?.type !== 'private') {
            await ctx.answerCbQuery(t(lang, 'error_private_only'), { show_alert: true });
            return;
        }

        userStates[ctx.from.id] = { action: 'awaiting_nick' };
        await ctx.answerCbQuery();
        await ctx.reply(t(lang, 'profile.enter_new_nick'), {
            reply_markup: { inline_keyboard: [[{ text: t(lang, 'buttons.cancel'), callback_data: 'cancel_input' }]] }
        });
    });

    bot.action('edit_pass', async (ctx) => {
        const lang = ctx.from.language_code;
        const userId = ctx.from.id;

        if (ctx.chat?.type !== 'private') {
            await ctx.answerCbQuery(t(lang, 'error_private_only'), { show_alert: true });
            return;
        }

        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: String(userId) }, select: { password: true } });
            if (isTelegramOnly(user.password)) {
                userStates[userId] = { action: 'awaiting_new_pass' };
                await ctx.reply(t(lang, 'profile.enter_new_pass'), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: t(lang, 'buttons.cancel'), callback_data: 'cancel_input' }]] }
                });
            } else {
                userStates[userId] = { action: 'awaiting_old_pass' };
                await ctx.reply(t(lang, 'profile.enter_old_pass'), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: t(lang, 'buttons.cancel'), callback_data: 'cancel_input' }]] }
                });
            }
            await ctx.answerCbQuery();
        } catch (e) { console.error('[TelegramBot] edit_pass error:', e); }
    });

    bot.command('friends', async (ctx) => showFriendsMenu(ctx, false));

    bot.action('friends_menu', async (ctx) => {
        await ctx.answerCbQuery();
        await showFriendsMenu(ctx, true);
    });

    async function showFriendsMenu(ctx, isEdit = false) {
        const lang = ctx.from.language_code;
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true, username: true } });
            if (!user) {
                const msg = t(lang, 'errors.user_not_found');
                return isEdit ? ctx.answerCbQuery(msg) : ctx.reply(msg);
            }

            const { accepted, pendingReceived } = await friendsDb.getFriendships(user.id);
            const text = t(lang, 'friends.caption', { count: accepted.length, requests: pendingReceived.length });

            const keyboard = [
                pendingReceived.length > 0 ? [{ text: t(lang, 'friends.btn_requests', { count: pendingReceived.length }), callback_data: 'friends_requests' }] : [],
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
            console.error('[TelegramBot] showFriendsMenu error:', e);
            if (isEdit) ctx.answerCbQuery('Error');
        }
    }

    bot.action('friends_requests', async (ctx) => {
        const lang = ctx.from.language_code;
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });
            const { pendingReceived } = await friendsDb.getFriendships(user.id);
            if (pendingReceived.length === 0) { await ctx.answerCbQuery('No requests'); return showFriendsMenu(ctx); }

            const request = pendingReceived[0];
            const safeNick = request.nickname.replace(/[_*[`]/g, '\\$&');
            const text = t(lang, 'friends.incoming_request', { username: safeNick });
            const keyboard = [
                [{ text: t(lang, 'friends.btn_accept'), callback_data: `friend_accept_${request.id}` }, { text: t(lang, 'friends.btn_decline'), callback_data: `friend_decline_${request.id}` }],
                [{ text: t(lang, 'buttons.cancel'), callback_data: 'friends_menu' }]
            ];
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (e) { console.error('[TelegramBot] friends_requests error:', e); }
    });

    bot.action(/friend_(accept|decline)_(\d+)/, async (ctx) => {
        const lang = ctx.from.language_code;
        const action = ctx.match[1];
        const friendId = parseInt(ctx.match[2]);
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });
            const friendUser = await prisma.user.findUnique({ where: { id: friendId }, select: { username: true } });
            if (action === 'accept') {
                await friendsDb.updateFriendshipStatus(user.id, friendId, 'accepted', user.id);
                await ctx.answerCbQuery(t(lang, 'friends.accepted', { username: friendUser?.username || 'User' }));
            } else {
                await friendsDb.removeFriendship(user.id, friendId);
                await ctx.answerCbQuery(t(lang, 'friends.declined'));
            }
            showFriendsMenu(ctx);
        } catch (e) { console.error('[TelegramBot] friend accept/decline error:', e); ctx.answerCbQuery('Error'); }
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
            const orderBy = type === 'rating' ? { rating: 'desc' } : { wins: 'desc' };
            const rows = await prisma.user.findMany({
                where: { is_banned: false },
                select: { username: true, rating: true, wins: true, is_verified: true },
                orderBy,
                take: limit
            });

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
            console.error('[TelegramBot] showLeaderboard error:', e);
            if (isEdit) ctx.answerCbQuery('DB Error');
        }
    }

    const askForDonation = async (ctx) => {
        const lang = ctx.from.language_code;

        if (ctx.chat?.type !== 'private') {
            return ctx.reply(t(lang, 'errors.error_private_only'));
        }

        userStates[ctx.from.id] = { action: 'awaiting_donation_amount' };
        await ctx.reply(t(lang, 'donate.ask_amount'), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: t(lang, 'buttons.cancel'), callback_data: 'cancel_input' }]] }
        });
    };
    bot.command('donate', askForDonation);
    bot.action('donate_start', async (ctx) => {
        await ctx.answerCbQuery();
        await askForDonation(ctx);
    });

    bot.command('createroom', async (ctx) => {
        const lang = ctx.from.language_code;
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });
            if (!user) return ctx.reply(t(lang, 'errors.no_account'));

            const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
            const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
            const rawText = ctx.message?.text || '';
            const lowerText = rawText.toLowerCase();
            const isTransferMode = lowerText.includes('perevod') || lowerText.includes('transfer');
            const lobbySettings = { maxPlayers: 4, lobbyType: 'private', gameMode: isTransferMode ? 'perevodnoy' : 'podkidnoy', betAmount: 0, deckSize: 36, turnDuration: 60 };

            await prisma.game.create({
                data: {
                    id: gameId,
                    status: 'waiting',
                    lobby_type: 'private',
                    invite_code: inviteCode,
                    max_players: lobbySettings.maxPlayers,
                    host_user_id: user.id,
                    game_settings: JSON.stringify(lobbySettings),
                    start_time: new Date().toISOString()
                }
            });

            setTimeout(async () => {
                const game = await prisma.game.findUnique({ where: { id: gameId }, select: { status: true } });
                if (game && game.status === 'waiting') {
                    await prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } });
                    ctx.telegram.sendMessage(telegramId, t(lang, 'bot.lobby_expired', { id: gameId }));
                }
            }, 300000);

            const joinLink = `https://t.me/${ctx.botInfo.username}/durak?startapp=${gameId}`;
            const message = t(lang, 'bot.lobby_created', { id: gameId, code: inviteCode });
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: t(lang, 'bot.join_link_btn'), url: joinLink }]] }
            });
        } catch (e) { console.error('[TelegramBot] createroom error:', e); ctx.reply(t(lang, 'bot.create_error')); }
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const state = userStates[userId];
        const lang = ctx.from.language_code;
        const text = ctx.message.text;

        if (!state) return;

        if (state.action === 'awaiting_nick') {
            if (text.length < 3 || text.length > 15 || !/^[a-zA-Z0-9_]+$/.test(text)) return ctx.reply(t(lang, 'profile.error_format'));
            try {
                const existing = await prisma.user.findFirst({ where: { username: text }, select: { id: true } });
                if (existing) return ctx.reply(t(lang, 'profile.error_nick_taken'));
                await prisma.user.updateMany({ where: { telegram_id: String(userId) }, data: { username: text } });
                delete userStates[userId];
                await ctx.reply(t(lang, 'profile.nick_updated', { username: text }), { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
                showProfile(ctx);
            } catch (e) { ctx.reply(t(lang, 'profile.error_db')); }
        }

        else if (state.action === 'awaiting_old_pass') {
            try { await ctx.deleteMessage(); } catch (e) { }
            try {
                const user = await prisma.user.findFirst({ where: { telegram_id: String(userId) }, select: { password: true } });
                const isMatch = await bcrypt.compare(text, user.password);
                if (!isMatch) {
                    const msg = await ctx.reply(t(lang, 'profile.error_wrong_pass'));
                    setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { }), 3000);
                    return;
                }
                userStates[userId] = { action: 'awaiting_new_pass' };
                await ctx.reply(t(lang, 'profile.enter_new_pass'), { parse_mode: 'Markdown' });
            } catch (e) { console.error('[TelegramBot] awaiting_old_pass error:', e); }
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
                await prisma.user.updateMany({ where: { telegram_id: String(userId) }, data: { password: hashedPassword } });
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
            const user = await prisma.user.findFirst({ where: { telegram_id: String(ctx.from.id) }, select: { id: true } });
            if (user) {
                await prisma.donation.create({
                    data: {
                        user_id: user.id,
                        telegram_payment_charge_id: payment.telegram_payment_charge_id,
                        amount: payment.total_amount
                    }
                });
            }
            await ctx.reply(t(lang, 'donate.success', { amount: payment.total_amount }), { parse_mode: 'Markdown' });
        } catch (e) { console.error('[TelegramBot] successful_payment error:', e); }
    });

    bot.on('inline_query', async (ctx) => {
        try {
            const lang = ctx.from.language_code;
            const telegramId = String(ctx.from.id);
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });

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
        } catch (err) { console.error('[TelegramBot] Inline query error:', err); }
    });

    bot.action('cancel_input', async (ctx) => {
        const userId = ctx.from.id;
        if (userStates[userId]) {
            delete userStates[userId];
            await ctx.answerCbQuery(t(ctx.from.language_code, 'profile.cancel'));
            await ctx.editMessageText(t(ctx.from.language_code, 'profile.cancel'));
        } else {
            await ctx.answerCbQuery();
            try { await ctx.deleteMessage(); } catch (e) { }
        }
    });

    bot.action(/create_lobby_inline_(podkidnoy|perevodnoy)_(\d+)/, async (ctx) => {
        const lang = ctx.from.language_code;
        const mode = ctx.match[1];
        const hostUserId = parseInt(ctx.match[2]);

        try {
            const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
            const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

            const lobbySettings = { maxPlayers: 4, lobbyType: 'private', deckSize: 36, gameMode: mode, betAmount: 0, turnDuration: 60 };

            await prisma.game.create({
                data: {
                    id: gameId,
                    status: 'waiting',
                    lobby_type: 'private',
                    invite_code: inviteCode,
                    max_players: lobbySettings.maxPlayers,
                    host_user_id: hostUserId,
                    game_settings: JSON.stringify(lobbySettings),
                    start_time: new Date().toISOString()
                }
            });

            const joinLink = `https://t.me/${ctx.botInfo.username}/durak?startapp=${gameId}`;

            await ctx.editMessageReplyMarkup({
                inline_keyboard: [[{ text: t(ctx.from.language_code, 'inline.lobby_join_button'), url: joinLink }]]
            });

            await ctx.answerCbQuery(t(lang, 'bot.lobby_created', { id: gameId, code: inviteCode }).split('\n')[0]);

        } catch (e) {
            console.error('[TelegramBot] Error creating inline lobby:', e);
            ctx.answerCbQuery(t(lang, 'bot.create_error'));
        }
    });

    async function showInbox(ctx, page = 1, isEdit = false) {
        const lang = ctx.from.language_code;
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });
            if (!user) return ctx.reply(t(lang, 'errors.no_account'));

            const inboxService = require('./inboxService');
            const { messages, pagination } = await inboxService.getMessages(user.id, { page, limit: 5 });

            if (messages.length === 0) {
                const emptyMsg = t(lang, 'inbox.empty');
                const kb = [[{ text: t(lang, 'buttons.back_to_menu'), callback_data: 'main_menu' }]];
                if (isEdit) return ctx.editMessageText(emptyMsg, { reply_markup: { inline_keyboard: kb } }).catch(() => { });
                return ctx.reply(emptyMsg, { reply_markup: { inline_keyboard: kb } });
            }

            let text = `${t(lang, 'inbox.title')}\n\n`;
            const keyboard = [];

            for (const msg of messages) {
                const title = t(lang, msg.title_key || 'inbox.system_message');
                const content = t(lang, msg.content_key, msg.content_params);
                const status = msg.is_read ? '📖' : '📩';

                text += `${status} **${title}**\n${content}\n\n`;

                if (msg.type === 'friend_request' && !msg.is_read) {
                    keyboard.push([
                        { text: `✅ ${t(lang, 'inbox.btn_accept')}`, callback_data: `inbox_act_${msg.id}_accept` },
                        { text: `❌ ${t(lang, 'inbox.btn_decline')}`, callback_data: `inbox_act_${msg.id}_decline` }
                    ]);
                } else if (msg.type === 'login_alert' && !msg.is_read) {
                    keyboard.push([{ text: `✅ ${t(lang, 'inbox.btn_it_was_me')}`, callback_data: `inbox_read_${msg.id}` }]);
                }
            }

            const navRow = [];
            if (page > 1) navRow.push({ text: t(lang, 'inbox.prev_page'), callback_data: `inbox_${page - 1}` });
            navRow.push({ text: t(lang, 'inbox.page_info', { current: page, total: pagination.totalPages }), callback_data: 'noop' });
            if (page < pagination.totalPages) navRow.push({ text: t(lang, 'inbox.next_page'), callback_data: `inbox_${page + 1}` });

            if (navRow.length > 0) keyboard.push(navRow);
            keyboard.push([{ text: t(lang, 'buttons.back_to_menu'), callback_data: 'main_menu' }]);

            if (isEdit) {
                await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(() => { });
            } else {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            }
        } catch (e) {
            console.error('[TelegramBot] Inbox error:', e);
        }
    }

    bot.action(/inbox_act_(\d+)_(accept|decline)/, async (ctx) => {
        const msgId = parseInt(ctx.match[1]);
        const action = ctx.match[2];
        const lang = ctx.from.language_code || 'en';
        const telegramId = String(ctx.from.id);

        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });
            if (!user) return ctx.answerCbQuery('User not found');

            const inboxService = require('./inboxService');
            const msgData = await prisma.inboxMessage.findFirst({
                where: { id: msgId, user_id: user.id }
            });

            if (msgData && msgData.type === 'friend_request') {
                const params = typeof msgData.content_params === 'string' ? JSON.parse(msgData.content_params) : msgData.content_params;
                const fromUserId = params.fromUserId;

                if (action === 'accept') {
                    await friendsDb.updateFriendshipStatus(fromUserId, user.id, 'accepted', user.id);
                } else {
                    await friendsDb.removeFriendship(fromUserId, user.id);
                }

                await inboxService.markAsRead(user.id, msgId);
                await ctx.answerCbQuery(t(lang, action === 'accept' ? 'friends.accepted' : 'friends.declined', { username: params.fromUsername }));
                await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
            } else {
                await ctx.answerCbQuery('Message not found or action expired');
                await showInbox(ctx, 1, true);
            }
        } catch (e) {
            console.error('[TelegramBot] Inbox action error:', e);
            ctx.answerCbQuery('Error');
        }
    });

    bot.action(/inbox_read_(\d+)/, async (ctx) => {
        const msgId = parseInt(ctx.match[1]);
        const telegramId = String(ctx.from.id);
        try {
            const user = await prisma.user.findFirst({ where: { telegram_id: telegramId }, select: { id: true } });
            if (!user) return;

            const inboxService = require('./inboxService');
            await inboxService.markAsRead(user.id, msgId);
            await ctx.answerCbQuery('OK');
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
        } catch (e) {
            console.error('[TelegramBot] Inbox read error:', e);
        }
    });

    bot.launch({ dropPendingUpdates: true })
        .then(() => console.log('[TelegramBot] Bot started successfully.'))
        .catch(err => console.error('[TelegramBot] Bot launch error:', err));
}

async function sendMessage(telegramId, text, extra = {}) {
    if (!bot || !telegramId) return;
    try {
        return await bot.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown', ...extra });
    } catch (e) {
        console.error(`[TelegramBot] Error sending message to ${telegramId}:`, e.message);
    }
}

async function stop() {
    if (bot) {
        console.log('[TelegramBot] Stopping...');
        await bot.stop();
        console.log('[TelegramBot] Stopped.');
    }
}

module.exports = { init, stop, sendMessage };
