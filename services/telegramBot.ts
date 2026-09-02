import { Bot, Context, InlineKeyboard } from 'grammy';
import type { InlineQueryResult } from 'grammy/types';
import crypto from 'node:crypto';
import { eq, and, not, like, desc, sql } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { user, achievement, userAchievement, activeSession, game, inboxMessage, donation } from '../db/schema.ts';
import { TELEGRAM_ONLY_PASSWORDS } from '../db/constants.ts';
import locales from './locales.js';
import type { LocaleTree } from './locales.js';
import friendsDb from '../db/friends.js';
import bcrypt from 'bcryptjs';

type UserRow = typeof user.$inferSelect;

interface UserState {
  action: 'awaiting_nick' | 'awaiting_old_pass' | 'awaiting_new_pass' | 'awaiting_donation_amount';
}

interface MyContext extends Context {
  userState?: UserState;
  dbUser?: UserRow;
}

const MD = { parse_mode: 'Markdown' as const };

let bot: Bot<MyContext> | null = null;
const APP_URL = process.env.TG_APP_URL || 'http://localhost:3000';

const userStates: Record<number, UserState> = {};

function t(langCode: string | undefined, key: string, params: Record<string, unknown> = {}): string {
  const lang = (langCode && langCode.split('-')[0]) || 'en';
  const localeMap = locales as Record<string, LocaleTree>;
  const selectedLang: LocaleTree = localeMap[lang] ?? localeMap["en"] ?? localeMap["en"]!;
  const keys = key.split('.');
  let value: LocaleTree | string = selectedLang;
  for (const k of keys) {
    if (typeof value !== 'string') {
      const next: LocaleTree | undefined = value[k];
      if (next === undefined) return key;
      value = next;
    } else return key;
  }
  if (typeof value !== 'string') return key;
  return value.replace(/{(\w+)}/g, (_, v: string) => (params[v] !== undefined ? String(params[v]) : `{${v}}`));
}

function isTelegramOnly(passwordHash: string): boolean {
  return (TELEGRAM_ONLY_PASSWORDS as readonly string[]).includes(passwordHash);
}

function getLang(ctx: MyContext): string {
  return ctx.from?.language_code || 'en';
}

function autoDelete(ctx: MyContext, message: NonNullable<Context['msg']>, ms = 3000): void {
  const currentBot = bot;
  if (!currentBot || !ctx.chat) return;
  setTimeout(() => {
    currentBot.api.deleteMessage(ctx.chat!.id, message.message_id).catch(() => {});
  }, ms);
}

async function showMainMenu(ctx: MyContext, isEdit: boolean = false): Promise<void> {
  const lang = getLang(ctx);
  const from = ctx.from!;
  const text = t(lang, 'welcome', { name: from.first_name });

  const keyboard = new InlineKeyboard()
    .url(t(lang, 'play_btn'), APP_URL)
    .row()
    .text(t(lang, 'profile.btn_open'), 'profile')
    .text(t(lang, 'btn_friends'), 'friends_menu')
    .row()
    .text(t(lang, 'btn_achievements'), 'achievements_1')
    .text(t(lang, 'btn_daily_bonus'), 'daily_bonus')
    .row()
    .text(t(lang, 'btn_leaderboard'), 'leaderboard_rating')
    .text(t(lang, 'inbox.title'), 'inbox_1')
    .row()
    .text(t(lang, 'btn_settings'), 'settings')
    .text(t(lang, 'btn_donate'), 'donate_start')
    .row()
    .url(t(lang, 'add_group_btn'), `https://t.me/${bot?.botInfo.username}?startgroup=true`);

  try {
    if (isEdit) await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
    else await ctx.reply(text, { reply_markup: keyboard });
  } catch (e: any) { console.error('[TelegramBot] MainMenu error:', e); }
}

async function init(token: string, getStatsCallback: () => Promise<any>): Promise<void> {
  if (!token) return console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN not set.');
  bot = new Bot<MyContext>(token);

  bot.catch((err) => {
    console.error('[Bot] Handler error:', err);
  });

  await bot.init();

  bot.use(async (ctx, next) => {
    if (ctx.from) {
      ctx.userState = userStates[ctx.from.id];
      ctx.dbUser = await db.query.user.findFirst({ where: { telegram_id: String(ctx.from.id) } }) ?? undefined;
    }
    await next();
  });

  bot.command('status', async (ctx) => {
    const lang = getLang(ctx);
    if (!getStatsCallback) { await ctx.reply(t(lang, 'status.not_available')); return; }
    const stats = await getStatsCallback();
    if (!stats) { await ctx.reply(t(lang, 'status.error_fetch')); return; }

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
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('start', async (ctx) => showMainMenu(ctx));
  bot.command('help', (ctx) => ctx.reply(t(getLang(ctx), 'help', { botname: bot!.botInfo.username })));

  bot.callbackQuery('main_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMainMenu(ctx, true);
  });

  bot.command('profile', async (ctx) => showProfile(ctx));
  bot.callbackQuery('profile', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProfile(ctx, true);
  });

  bot.command('inbox', async (ctx) => { await showInbox(ctx, 1); });
  bot.callbackQuery(/inbox_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match![1]!);
    await ctx.answerCallbackQuery();
    await showInbox(ctx, page, true);
  });

  bot.callbackQuery(/achievements_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match![1]!);
    await ctx.answerCallbackQuery();
    await showAchievements(ctx, page, true);
  });

  bot.callbackQuery('daily_bonus', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDailyBonus(ctx, true);
  });

  bot.callbackQuery('claim_daily_bonus', async (ctx) => {
    await claimDailyBonus(ctx);
  });

  bot.callbackQuery('settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx, true);
  });

  bot.callbackQuery('settings_card_back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCardBacks(ctx, true);
  });

  bot.callbackQuery(/set_card_back_(.+)/, async (ctx) => {
    const style = ctx.match![1]!;
    await setCardBack(ctx, style);
  });

  bot.callbackQuery('settings_quick_game', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showQuickGameSettings(ctx, true);
  });

  bot.callbackQuery('settings_sessions', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSessions(ctx, true);
  });

  bot.callbackQuery('terminate_all_sessions', async (ctx) => {
    await terminateAllSessions(ctx);
  });

  async function showProfile(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    try {
      const foundUser = ctx.dbUser;
      if (!foundUser) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const isTgOnly = isTelegramOnly(foundUser.password);
      const statusText = isTgOnly ? t(lang, 'profile.status_tg_only') : t(lang, 'profile.status_full');
      const passBtnText = isTgOnly ? t(lang, 'profile.btn_set_pass') : t(lang, 'profile.btn_change_pass');

      const text = t(lang, 'profile.caption', {
        id: foundUser.id, username: foundUser.username, account_status: statusText,
        wins: foundUser.wins || 0, losses: foundUser.losses || 0, rating: foundUser.rating || 0, coins: foundUser.coins || 0
      });

      const keyboard = new InlineKeyboard()
        .text(t(lang, 'profile.btn_edit_nick'), 'edit_nick')
        .text(passBtnText, 'edit_pass')
        .row()
        .text(t(lang, 'profile.btn_refresh'), 'profile')
        .text(t(lang, 'buttons.back_to_menu'), 'main_menu')
        .row()
        .url(t(lang, 'play_btn'), APP_URL);

      if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] showProfile error:', e); }
  }

  bot.callbackQuery('edit_nick', async (ctx) => {
    const lang = getLang(ctx);
    const from = ctx.from!;

    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery({ text: t(lang, 'error_private_only'), show_alert: true });
      return;
    }

    userStates[from.id] = { action: 'awaiting_nick' };
    await ctx.answerCallbackQuery();
    await ctx.reply(t(lang, 'profile.enter_new_nick'), {
      reply_markup: new InlineKeyboard().text(t(lang, 'buttons.cancel'), 'cancel_input')
    });
  });

  bot.callbackQuery('edit_pass', async (ctx) => {
    const lang = getLang(ctx);
    const from = ctx.from!;
    const userId = from.id;

    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery({ text: t(lang, 'error_private_only'), show_alert: true });
      return;
    }

    try {
      const password = ctx.dbUser?.password;
      if (password && isTelegramOnly(password)) {
        userStates[userId] = { action: 'awaiting_new_pass' };
        await ctx.reply(t(lang, 'profile.enter_new_pass'), {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text(t(lang, 'buttons.cancel'), 'cancel_input')
        });
      } else {
        userStates[userId] = { action: 'awaiting_old_pass' };
        await ctx.reply(t(lang, 'profile.enter_old_pass'), {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text(t(lang, 'buttons.cancel'), 'cancel_input')
        });
      }
      await ctx.answerCallbackQuery();
    } catch (e: any) { console.error('[TelegramBot] edit_pass error:', e); }
  });

  bot.command('friends', async (ctx) => showFriendsMenu(ctx, false));

  bot.callbackQuery('friends_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFriendsMenu(ctx, true);
  });

  async function showFriendsMenu(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    const telegramId = String(ctx.from!.id);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) {
        const msg = t(lang, 'errors.user_not_found');
        if (isEdit) await ctx.answerCallbackQuery(msg); else await ctx.reply(msg);
        return;
      }

      const { accepted, pendingReceived } = await friendsDb.getFriendships(userRecord.id);
      const text = t(lang, 'friends.caption', { count: accepted.length, requests: pendingReceived.length });

      const keyboard = new InlineKeyboard();
      if (pendingReceived.length > 0) {
        keyboard.text(t(lang, 'friends.btn_requests', { count: pendingReceived.length }), 'friends_requests').row();
      }
      keyboard.switchInline(t(lang, 'friends.btn_add')).row();
      keyboard.text(t(lang, 'buttons.back_to_menu'), 'main_menu');

      let friendListText = '';
      if (accepted.length > 0) {
        friendListText = '\n\n' + accepted.slice(0, 10).map((f, i) => {
          const safeNick = f.nickname.replace(/[_*[`]/g, '\\$&');
          return `${i + 1}. 👤 **${safeNick}** (${f.rating}⭐)`;
        }).join('\n');
        if (accepted.length > 10) friendListText += '\n...';
      } else {
        friendListText = '\n\n_' + t(lang, 'friends.list_empty') + '_';
      }

      const inviteLink = `https://t.me/${bot!.botInfo.username}?start=invite\\_${userRecord.id}`;
      const footer = `\n\n${t(lang, 'friends.invite_link', { link: inviteLink })}`;

      const fullText = text + friendListText + footer;

      if (isEdit) {
        await ctx.editMessageText(fullText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.reply(fullText, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (e) {
      console.error('[TelegramBot] showFriendsMenu error:', e);
      if (isEdit) ctx.answerCallbackQuery('Error');
    }
  }

  bot.callbackQuery('friends_requests', async (ctx) => {
    const lang = getLang(ctx);
    const telegramId = String(ctx.from!.id);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.answerCallbackQuery('No requests'); return; }
      const { pendingReceived } = await friendsDb.getFriendships(userRecord.id);
      if (pendingReceived.length === 0) { await ctx.answerCallbackQuery('No requests'); await showFriendsMenu(ctx); return; }

      const request = pendingReceived[0];
      const safeNick = request.nickname.replace(/[_*[`]/g, '\\$&');
      const text = t(lang, 'friends.incoming_request', { username: safeNick });
      const keyboard = new InlineKeyboard()
        .text(t(lang, 'friends.btn_accept'), `friend_accept_${request.id}`)
        .text(t(lang, 'friends.btn_decline'), `friend_decline_${request.id}`)
        .row()
        .text(t(lang, 'buttons.cancel'), 'friends_menu');
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] friends_requests error:', e); }
  });

  bot.callbackQuery(/friend_(accept|decline)_(\d+)/, async (ctx) => {
    const lang = getLang(ctx);
    const action = ctx.match![1]!;
    const friendId = parseInt(ctx.match![2]!);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.answerCallbackQuery('Error'); return; }
      const friendRow = await db
        .select({ username: user.username })
        .from(user)
        .where(eq(user.id, friendId));
      const friendUser = friendRow[0];
      if (action === 'accept') {
        await friendsDb.updateFriendshipStatus(userRecord.id, friendId, 'accepted', userRecord.id);
        await ctx.answerCallbackQuery(t(lang, 'friends.accepted', { username: friendUser?.username || 'User' }));
      } else {
        await friendsDb.removeFriendship(userRecord.id, friendId);
        await ctx.answerCallbackQuery(t(lang, 'friends.declined'));
      }
      showFriendsMenu(ctx);
    } catch (e: any) { console.error('[TelegramBot] friend accept/decline error:', e); ctx.answerCallbackQuery('Error'); }
  });

  bot.command('leaderboard', async (ctx) => showLeaderboard(ctx, 'rating', false));

  bot.callbackQuery(/leaderboard_(rating|wins)/, async (ctx) => {
    const type = ctx.match![1]!;
    await ctx.answerCallbackQuery();
    showLeaderboard(ctx, type, true);
  });

  async function showLeaderboard(ctx: MyContext, type: string = 'rating', isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    const limit = 10;
    try {
      const orderBy = type === 'rating' ? desc(user.rating) : desc(user.wins);
      const rows = await db
        .select({
          username: user.username,
          rating: user.rating,
          wins: user.wins,
          is_verified: user.is_verified
        })
        .from(user)
        .where(eq(user.is_banned, false))
        .orderBy(orderBy)
        .limit(limit);

      if (!rows.length) {
        const msg = t(lang, 'leaderboard.empty');
        if (isEdit) await ctx.answerCallbackQuery(msg); else await ctx.reply(msg);
        return;
      }

      let text = t(lang, 'leaderboard.caption', { limit }) + '\n\n';
      rows.forEach((row: any, index: any) => {
        let icon = '👤';
        if (index === 0) icon = '🥇'; if (index === 1) icon = '🥈'; if (index === 2) icon = '🥉';
        if (row.is_verified) icon += '☑️';
        const score = type === 'rating' ? `${row.rating} ⭐` : `${row.wins} 🏅`;
        const safeNick = row.username.replace(/[_*[`]/g, '\\$&');
        text += t(lang, 'leaderboard.format', { rank: index + 1, icon, username: safeNick, score }) + '\n';
      });

      const keyboard = new InlineKeyboard()
        .text(t(lang, 'leaderboard.btn_rating') + (type === 'rating' ? ' ✅' : ''), 'leaderboard_rating')
        .text(t(lang, 'leaderboard.btn_wins') + (type === 'wins' ? ' ✅' : ''), 'leaderboard_wins')
        .row()
        .text(t(lang, 'buttons.back_to_menu'), 'main_menu');

      if (isEdit) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (e) {
      console.error('[TelegramBot] showLeaderboard error:', e);
      if (isEdit) ctx.answerCallbackQuery('DB Error');
    }
  }

  const askForDonation = async (ctx: MyContext): Promise<void> => {
    const lang = getLang(ctx);
    const from = ctx.from!;

    if (ctx.chat?.type !== 'private') {
      await ctx.reply(t(lang, 'errors.error_private_only'));
      return;
    }

    userStates[from.id] = { action: 'awaiting_donation_amount' };
    await ctx.reply(t(lang, 'donate.ask_amount'), {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text(t(lang, 'buttons.cancel'), 'cancel_input')
    });
  };

  async function showAchievements(ctx: MyContext, page: number = 1, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    const limit = 5;
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const allAchievements = await db.select().from(achievement);

      const unlocked = await db
        .select()
        .from(userAchievement)
        .where(eq(userAchievement.user_id, userRecord.id));

      const text = t(lang, 'achievements.title', { count: unlocked.length, total: allAchievements.length });

      const totalPages = Math.ceil(unlocked.length / limit) || 1;
      const currentPage = Math.min(page, totalPages);
      const start = (currentPage - 1) * limit;
      const pageItems = unlocked.slice(start, start + limit);

      let listText = '';
      if (unlocked.length === 0) {
        listText = '\n\n' + t(lang, 'achievements.empty');
      } else {
        listText = '\n\n' + pageItems.map((ua: any) => {
          const ach = allAchievements.find((a: any) => a.code === ua.achievement_code);
          if (!ach) return '';
          const rarityIcon = t(lang, `achievements.rarity_${ach.rarity}`);
          return t(lang, 'achievements.list_item', {
            icon: rarityIcon,
            name: t(lang, ach.name_key),
            desc: t(lang, ach.description_key)
          });
        }).join('\n\n');
      }

      const keyboard = new InlineKeyboard();
      if (currentPage > 1) keyboard.text('⬅️', `achievements_${currentPage - 1}`);
      if (currentPage < totalPages) keyboard.text('➡️', `achievements_${currentPage + 1}`);
      if (currentPage > 1 || currentPage < totalPages) keyboard.row();
      keyboard.text(t(lang, 'buttons.back_to_menu'), 'main_menu');

      if (isEdit) await ctx.editMessageText(text + listText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      else await ctx.reply(text + listText, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] showAchievements error:', e); }
  }

  async function showDailyBonus(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const lastClaim = userRecord.last_daily_bonus_claim;
      const today = new Date().toDateString();
      const isClaimed = lastClaim && new Date(lastClaim).toDateString() === today;

      const bonusAmount = 200; // Match economyService.js
      const text = isClaimed ? t(lang, 'daily_bonus.claimed') : t(lang, 'daily_bonus.available', { amount: bonusAmount });

      const keyboard = new InlineKeyboard();
      if (!isClaimed) keyboard.text(t(lang, 'daily_bonus.btn_claim'), 'claim_daily_bonus');
      if (!isClaimed) keyboard.row();
      keyboard.text(t(lang, 'buttons.back_to_menu'), 'main_menu');

      if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] showDailyBonus error:', e); }
  }

  async function claimDailyBonus(ctx: MyContext): Promise<void> {
    const lang = getLang(ctx);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.answerCallbackQuery(t(lang, 'errors.no_account')); return; }

      const lastClaim = userRecord.last_daily_bonus_claim;
      const today = new Date().toDateString();
      if (lastClaim && new Date(lastClaim).toDateString() === today) {
        await ctx.answerCallbackQuery({ text: t(lang, 'daily_bonus.claimed'), show_alert: true });
        return;
      }

      const bonusAmount = 200;
      await db
        .update(user)
        .set({ coins: sql`${user.coins} + ${bonusAmount}`, last_daily_bonus_claim: new Date() })
        .where(eq(user.id, userRecord.id));

      await ctx.answerCallbackQuery({ text: t(lang, 'daily_bonus.success', { amount: bonusAmount }), show_alert: true });
      await showDailyBonus(ctx, true);
    } catch (e: any) { console.error('[TelegramBot] claimDailyBonus error:', e); ctx.answerCallbackQuery('Error'); }
  }

  async function showSettings(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    const text = t(lang, 'settings.title');
    const keyboard = new InlineKeyboard()
      .text(t(lang, 'settings.btn_card_back'), 'settings_card_back')
      .row()
      .text(t(lang, 'settings.btn_quick_game'), 'settings_quick_game')
      .row()
      .text(t(lang, 'settings.btn_sessions'), 'settings_sessions')
      .row()
      .text(t(lang, 'buttons.back_to_menu'), 'main_menu');
    if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }

  async function showCardBacks(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    const styles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
    try {
      const currentStyle = ctx.dbUser?.card_back_style ?? 'default';
      const text = t(lang, 'settings.card_back_title') + '\n' + t(lang, 'settings.card_back_current', { style: currentStyle });

      const keyboard = new InlineKeyboard();
      styles.forEach((s) => {
        keyboard.text((s === currentStyle ? '✅ ' : '') + s.toUpperCase(), `set_card_back_${s}`);
      });
      keyboard.row().text(t(lang, 'buttons.back_to_settings'), 'settings');

      if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] showCardBacks error:', e); }
  }

  async function setCardBack(ctx: MyContext, style: string): Promise<void> {
    const lang = getLang(ctx);
    const telegramId = String(ctx.from!.id);
    try {
      await db
        .update(user)
        .set({ card_back_style: style })
        .where(eq(user.telegram_id, telegramId));
      await ctx.answerCallbackQuery('✅ ' + style);
      await showCardBacks(ctx, true);
    } catch (e: any) { console.error('[TelegramBot] setCardBack error:', e); ctx.answerCallbackQuery('Error'); }
  }

  async function showQuickGameSettings(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const text = t(lang, 'settings.quick_game_title') + '\n\n' +
        t(lang, 'settings.quick_game_desc') + '\n\n' +
        t(lang, 'settings.deck_size', { value: userRecord.pref_quick_deck_size }) + '\n' +
        t(lang, 'settings.max_players', { value: userRecord.pref_quick_max_players }) + '\n' +
        t(lang, 'settings.game_mode', { value: t(lang, `game_mode_${userRecord.pref_quick_game_mode}`) }) + '\n' +
        t(lang, 'settings.betting', { value: userRecord.pref_quick_is_betting ? '✅' : '❌' }) + '\n' +
        (userRecord.pref_quick_is_betting ? t(lang, 'settings.bet_amount', { value: userRecord.pref_quick_bet_amount }) : '');

      const keyboard = new InlineKeyboard()
        .text(t(lang, 'buttons.back_to_settings'), 'settings');

      if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] showQuickGameSettings error:', e); }
  }

  async function showSessions(ctx: MyContext, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const sessions = await db
        .select()
        .from(activeSession)
        .where(eq(activeSession.user_id, userRecord.id));

      let text = t(lang, 'settings.sessions_title') + '\n\n' + t(lang, 'settings.sessions_desc') + '\n\n';
      text += t(lang, 'settings.sessions_current') + '\n\n';

      const otherSessions = sessions.filter((s: any) => !s.id.startsWith('tg_')); // Simple heuristic
      if (otherSessions.length > 0) {
        text += otherSessions.map((s: any) => {
          return t(lang, 'settings.sessions_item', {
            os: s.device_info || 'Unknown',
            browser: '',
            ip: s.ip_address || '?',
            location: s.location || '?',
            active: new Date(s.last_active).toLocaleString(lang)
          });
        }).join('\n\n');
      } else {
        text += '_No other active sessions_';
      }

      const keyboard = new InlineKeyboard();
      if (otherSessions.length > 0) keyboard.text(t(lang, 'settings.btn_terminate_all'), 'terminate_all_sessions');
      if (otherSessions.length > 0) keyboard.row();
      keyboard.text(t(lang, 'buttons.back_to_settings'), 'settings');

      if (isEdit) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (e: any) { console.error('[TelegramBot] showSessions error:', e); }
  }

  async function terminateAllSessions(ctx: MyContext): Promise<void> {
    const lang = getLang(ctx);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.answerCallbackQuery('User not found'); return; }
      await db
        .delete(activeSession)
        .where(and(eq(activeSession.user_id, userRecord.id), not(like(activeSession.id, 'tg_%'))));
      await ctx.answerCallbackQuery({ text: t(lang, 'settings.terminated_all'), show_alert: true });
      await showSessions(ctx, true);
    } catch (e: any) { console.error('[TelegramBot] terminateAllSessions error:', e); ctx.answerCallbackQuery('Error'); }
  }

  const donateHandler = async (ctx: MyContext): Promise<void> => {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    await askForDonation(ctx);
  };
  bot.command('donate', donateHandler);
  bot.callbackQuery('donate_start', donateHandler);

  bot.command('createroom', async (ctx) => {
    const lang = getLang(ctx);
    const telegramId = String(ctx.from!.id);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
      const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      const rawText = ctx.message?.text || '';
      const lowerText = rawText.toLowerCase();
      const isTransferMode = lowerText.includes('perevod') || lowerText.includes('transfer');
      const lobbySettings = { maxPlayers: 4, lobbyType: 'private', gameMode: isTransferMode ? 'perevodnoy' : 'podkidnoy', betAmount: 0, deckSize: 36, turnDuration: 60 };

      await db.insert(game).values({
        id: gameId,
        status: 'waiting',
        lobby_type: 'private',
        invite_code: inviteCode,
        max_players: lobbySettings.maxPlayers,
        host_user_id: userRecord.id,
        game_settings: JSON.stringify(lobbySettings),
        start_time: new Date().toISOString()
      });

      setTimeout(async () => {
        const gameRow = await db
          .select({ status: game.status })
          .from(game)
          .where(eq(game.id, gameId));
        if (gameRow[0] && gameRow[0].status === 'waiting') {
          await db.update(game).set({ status: 'cancelled' }).where(eq(game.id, gameId));
          if (bot) await bot.api.sendMessage(telegramId, t(lang, 'bot.lobby_expired', { id: gameId }));
        }
      }, 300000);

      const joinLink = `https://t.me/${bot!.botInfo.username}/durak?startapp=${gameId}`;
      const message = t(lang, 'bot.lobby_created', { id: gameId, code: inviteCode });
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().url(t(lang, 'bot.join_link_btn'), joinLink)
      });
    } catch (e: any) { console.error('[TelegramBot] createroom error:', e); ctx.reply(t(lang, 'bot.create_error')); }
  });

  bot.on('msg:text', async (ctx) => {
    const userId = ctx.from!.id;
    const state = ctx.userState;
    const lang = getLang(ctx);
    const text = ctx.message!.text!;

    if (!state) return;

    if (state.action === 'awaiting_nick') {
      if (text.length < 3 || text.length > 15 || !/^[a-zA-Z0-9_]+$/.test(text)) return ctx.reply(t(lang, 'profile.error_format'));
      try {
        const existing = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.username, text));
        if (existing[0]) return ctx.reply(t(lang, 'profile.error_nick_taken'));
        await db
          .update(user)
          .set({ username: text })
          .where(eq(user.telegram_id, String(userId)));
        delete userStates[userId];
        await ctx.reply(t(lang, 'profile.nick_updated', { username: text }), { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        showProfile(ctx);
      } catch (e) { ctx.reply(t(lang, 'profile.error_db')); }
    }

    else if (state.action === 'awaiting_old_pass') {
      try { await ctx.deleteMessage(); } catch (e: any) {}
      try {
        const foundUser = await db
          .select({ password: user.password })
          .from(user)
          .where(eq(user.telegram_id, String(userId)));
        const password = foundUser[0]?.password;
        const isMatch = await bcrypt.compare(text, password);
        if (!isMatch) {
          const msg = await ctx.reply(t(lang, 'profile.error_wrong_pass'));
          autoDelete(ctx, msg);
          return;
        }
        userStates[userId] = { action: 'awaiting_new_pass' };
        await ctx.reply(t(lang, 'profile.enter_new_pass'), { parse_mode: 'Markdown' });
      } catch (e: any) { console.error('[TelegramBot] awaiting_old_pass error:', e); }
    }

    else if (state.action === 'awaiting_new_pass') {
      try { await ctx.deleteMessage(); } catch (e: any) {}
      if (text.length < 4 || text.length > 30) {
        const msg = await ctx.reply(t(lang, 'profile.error_format'));
        autoDelete(ctx, msg);
        return;
      }
      try {
        const hashedPassword = await bcrypt.hash(text, 10);
        await db
          .update(user)
          .set({ password: hashedPassword })
          .where(eq(user.telegram_id, String(userId)));
        delete userStates[userId];
        const msg = await ctx.reply(t(lang, 'profile.pass_set_success'), { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        autoDelete(ctx, msg);
        showProfile(ctx);
      } catch (e) { ctx.reply(t(lang, 'profile.error_db')); }
    }

    else if (state.action === 'awaiting_donation_amount') {
      const amount = parseInt(text);
      if (isNaN(amount) || amount < 1) { await ctx.reply(t(lang, 'donate.error_amount')); return; }
      if (amount > 2500) { await ctx.reply(t(lang, 'donate.error_too_big')); return; }
      delete userStates[userId];
      const tempMsg = await ctx.reply('⏳', { reply_markup: { remove_keyboard: true } });
      if (bot) try { await bot.api.deleteMessage(ctx.chat!.id, tempMsg.message_id); } catch (e: any) {}
      await ctx.replyWithInvoice(
        t(lang, 'donate.title'),
        t(lang, 'donate.description'),
        `donation_${userId}_${Date.now()}`,
        'XTR',
        [{ label: t(lang, 'donate.label'), amount }],
        { start_parameter: 'donation' }
      );
    }
  });

  bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
  bot.on('message:successful_payment', async (ctx) => {
    const lang = getLang(ctx);
    const payment = ctx.message!.successful_payment!;
    try {
      const userRecord = ctx.dbUser;
      if (userRecord) {
        await db.insert(donation).values({
          user_id: userRecord.id,
          telegram_payment_charge_id: payment.telegram_payment_charge_id,
          amount: payment.total_amount
        });
      }
      await ctx.reply(t(lang, 'donate.success', { amount: payment.total_amount }), { parse_mode: 'Markdown' });
    } catch (e: any) { console.error('[TelegramBot] successful_payment error:', e); }
  });

  bot.on('inline_query', async (ctx) => {
    try {
      const lang = getLang(ctx);
      const userRecord = ctx.dbUser;

      const results: InlineQueryResult[] = [{
        type: 'article', id: 'play_game',
        title: t(lang, 'inline.title'), description: t(lang, 'inline.desc'),
        thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/8002/8002169.png',
        input_message_content: { message_text: t(lang, 'inline.message') },
        reply_markup: new InlineKeyboard().url(t(lang, 'inline.button'), APP_URL)
      }];

      if (userRecord) {
        results.push({
          type: 'article', id: 'create_private_lobby',
          title: t(lang, 'inline.create_lobby_title'), description: t(lang, 'inline.create_lobby_desc'),
          thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3039/3039386.png',
          input_message_content: { message_text: t(lang, 'inline.lobby_invite_message') },
          reply_markup: new InlineKeyboard()
            .text(t(lang, 'inline.create_podkidnoy_btn'), `create_lobby_inline_podkidnoy_${userRecord.id}`)
            .text(t(lang, 'inline.create_perevodnoy_btn'), `create_lobby_inline_perevodnoy_${userRecord.id}`)
        });
      }
      await ctx.answerInlineQuery(results, { cache_time: 0 });
    } catch (err) { console.error('[TelegramBot] Inline query error:', err); }
  });

  bot.callbackQuery('cancel_input', async (ctx) => {
    const from = ctx.from!;
    if (userStates[from.id]) {
      delete userStates[from.id];
      const lang = getLang(ctx);
      await ctx.answerCallbackQuery(t(lang, 'profile.cancel'));
      await ctx.editMessageText(t(lang, 'profile.cancel'));
    } else {
      await ctx.answerCallbackQuery();
      try { await ctx.deleteMessage(); } catch (e: any) {}
    }
  });

  bot.callbackQuery(/create_lobby_inline_(podkidnoy|perevodnoy)_(\d+)/, async (ctx) => {
    const lang = getLang(ctx);
    const mode = ctx.match![1]!;
    const hostUserId = parseInt(ctx.match![2]!);

    try {
      const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();
      const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

      const lobbySettings = { maxPlayers: 4, lobbyType: 'private', deckSize: 36, gameMode: mode, betAmount: 0, turnDuration: 60 };

      await db.insert(game).values({
        id: gameId,
        status: 'waiting',
        lobby_type: 'private',
        invite_code: inviteCode,
        max_players: lobbySettings.maxPlayers,
        host_user_id: hostUserId,
        game_settings: JSON.stringify(lobbySettings),
        start_time: new Date().toISOString()
      });

      const joinLink = `https://t.me/${bot!.botInfo.username}/durak?startapp=${gameId}`;

      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().url(t(lang, 'inline.lobby_join_button'), joinLink)
      });

      await ctx.answerCallbackQuery(t(lang, 'bot.lobby_created', { id: gameId, code: inviteCode }).split('\n')[0]);

    } catch (e) {
      console.error('[TelegramBot] Error creating inline lobby:', e);
      ctx.answerCallbackQuery(t(lang, 'bot.create_error'));
    }
  });

  async function showInbox(ctx: MyContext, page: number = 1, isEdit: boolean = false): Promise<void> {
    const lang = getLang(ctx);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) { await ctx.reply(t(lang, 'errors.no_account')); return; }

      const inboxService = await import('./inboxService.js');
      const { messages, pagination } = await inboxService.getMessages(userRecord.id, { page, limit: 5 });

      if (messages.length === 0) {
        const emptyMsg = t(lang, 'inbox.empty');
        const kb = new InlineKeyboard().text(t(lang, 'buttons.back_to_menu'), 'main_menu');
        if (isEdit) { await ctx.editMessageText(emptyMsg, { reply_markup: kb }).catch(() => {}); return; }
        await ctx.reply(emptyMsg, { reply_markup: kb });
        return;
      }

      let text = `${t(lang, 'inbox.title')}\n\n`;
      const keyboard = new InlineKeyboard();

      for (const msg of messages) {
        const title = t(lang, msg.title_key || 'inbox.system_message');
        const content = t(lang, msg.content_key, msg.content_params);
        const status = msg.is_read ? '📖' : '📩';

        text += `${status} **${title}**\n${content}\n\n`;

        if (msg.type === 'friend_request' && !msg.is_read) {
          keyboard.text(`✅ ${t(lang, 'inbox.btn_accept')}`, `inbox_act_${msg.id}_accept`)
            .text(`❌ ${t(lang, 'inbox.btn_decline')}`, `inbox_act_${msg.id}_decline`).row();
        } else if (msg.type === 'login_alert' && !msg.is_read) {
          keyboard.text(`✅ ${t(lang, 'inbox.btn_it_was_me')}`, `inbox_read_${msg.id}`).row();
        }
      }

      if (page > 1) keyboard.text(t(lang, 'inbox.prev_page'), `inbox_${page - 1}`);
      keyboard.text(t(lang, 'inbox.page_info', { current: page, total: pagination.totalPages }), 'noop');
      if (page < pagination.totalPages) keyboard.text(t(lang, 'inbox.next_page'), `inbox_${page + 1}`);
      keyboard.row();
      keyboard.text(t(lang, 'buttons.back_to_menu'), 'main_menu');

      if (isEdit) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (e) {
      console.error('[TelegramBot] Inbox error:', e);
    }
  }

  bot.callbackQuery(/inbox_act_(\d+)_(accept|decline)/, async (ctx) => {
    const msgId = parseInt(ctx.match![1]!);
    const action = ctx.match![2]!;
    const lang = getLang(ctx);

    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) return ctx.answerCallbackQuery('User not found');

      const inboxService = await import('./inboxService.js');
      const msgData = await db
        .select()
        .from(inboxMessage)
        .where(and(eq(inboxMessage.id, msgId), eq(inboxMessage.user_id, userRecord.id)));

      const msgRow = msgData[0];

      if (msgRow && msgRow.type === 'friend_request') {
        const params = typeof msgRow.content_params === 'string' ? JSON.parse(msgRow.content_params) : msgRow.content_params;
        const fromUserId = params.fromUserId;

        if (action === 'accept') {
          await friendsDb.updateFriendshipStatus(fromUserId, userRecord.id, 'accepted', userRecord.id);
        } else {
          await friendsDb.removeFriendship(fromUserId, userRecord.id);
        }

        await inboxService.markAsRead(userRecord.id, msgId);
        await ctx.answerCallbackQuery(t(lang, action === 'accept' ? 'friends.accepted' : 'friends.declined', { username: params.fromUsername }));
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
      } else {
        await ctx.answerCallbackQuery('Message not found or action expired');
        await showInbox(ctx, 1, true);
      }
    } catch (e) {
      console.error('[TelegramBot] Inbox action error:', e);
      ctx.answerCallbackQuery('Error');
    }
  });

  bot.callbackQuery(/inbox_read_(\d+)/, async (ctx) => {
    const msgId = parseInt(ctx.match![1]!);
    try {
      const userRecord = ctx.dbUser;
      if (!userRecord) return;

      const inboxService = await import('./inboxService.js');
      await inboxService.markAsRead(userRecord.id, msgId);
      await ctx.answerCallbackQuery('OK');
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    } catch (e) {
      console.error('[TelegramBot] Inbox read error:', e);
    }
  });

  bot.start({
    drop_pending_updates: true,
    onStart: () => console.log('[TelegramBot] Bot started successfully.')
  }).catch((err) => console.error('[TelegramBot] Bot start error:', err));
}

async function sendMessage(telegramId: string, text: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  if (!bot || !telegramId) return;
  try {
    return await bot.api.sendMessage(telegramId, text, { parse_mode: 'Markdown', ...extra });
  } catch (e) {
    console.error(`[TelegramBot] Error sending message to ${telegramId}:`, (e as Error).message);
  }
}

async function stop() {
  if (bot) {
    console.log('[TelegramBot] Stopping...');
    await bot.stop();
    console.log('[TelegramBot] Stopped.');
  }
}

export { init, stop, sendMessage };

export default { init, stop, sendMessage };
