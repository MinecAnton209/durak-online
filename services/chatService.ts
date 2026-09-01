import { eq } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { chatFilter } from '../db/schema.ts';

interface ChatMessage {
  id: string;
  author: { id: number; username: string; isAdmin: boolean; isVerified: boolean; isMuted: boolean; muteUntil: any };
  text: string;
  timestamp: number;
}

const chatSpamTracker = new Map<number, { lastTime: number; violations: number }>();
const globalChatHistory: ChatMessage[] = [];
const CHAT_HISTORY_LIMIT = 50;
const CHAT_PAGE_SIZE = 50;

(global as any).globalChatSettings = {
  slowModeInterval: 0
};

(global as any).chatFilters = {
  badWords: [] as string[],
  regexes: [] as RegExp[]
};

async function loadChatFilters(): Promise<void> {
  try {
    const filters = await db
      .select({
        type: chatFilter.type,
        content: chatFilter.content
      })
      .from(chatFilter)
      .where(eq(chatFilter.is_enabled, true));

    const defaultLinkRegex = '(http:\\/\\/|https:\\/\\/|www\\.)';
    const hasLinkRegex = filters.some((f: any) => f.type === 'regex' && f.content === defaultLinkRegex);

    if (!hasLinkRegex) {
      console.log('Autoseeding default link regex...');
      try {
        await db.insert(chatFilter).values({ type: 'regex', content: defaultLinkRegex });
        filters.push({ type: 'regex', content: defaultLinkRegex });
      } catch (seedErr: any) {
        console.error('Error autoseeding link regex:', seedErr);
      }
    }

    const words: string[] = [];
    const regexes: RegExp[] = [];

    filters.forEach((f: any) => {
      if (f.type === 'word') words.push(f.content.toLowerCase());
      if (f.type === 'regex') {
        try {
          regexes.push(new RegExp(f.content, 'i'));
        } catch (e: any) {
          console.error(`Invalid regex in DB: ${f.content}`, e);
        }
      }
    });

    (global as any).chatFilters.badWords = words;
    (global as any).chatFilters.regexes = regexes;

    console.log(`✅ Loaded ${words.length} bad words and ${regexes.length} regex filters.`);
  } catch (error: any) {
    console.error('❌ Failed to load chat filters:', error);
  }
}

function getChatHistory(beforeTimestamp: number | null = null): ChatMessage[] | { messages: ChatMessage[]; hasMore: boolean } {
  if (!beforeTimestamp) {
    return globalChatHistory.slice(-CHAT_PAGE_SIZE);
  }
  const lastIndex = globalChatHistory.findIndex((msg) => msg.timestamp < beforeTimestamp);
  if (lastIndex > -1) {
    const startIndex = Math.max(0, lastIndex - CHAT_PAGE_SIZE);
    return {
      messages: globalChatHistory.slice(startIndex, lastIndex),
      hasMore: startIndex > 0
    };
  }
  return { messages: [], hasMore: false };
}

function addMessageToHistory(message: ChatMessage): void {
  globalChatHistory.push(message);
  if (globalChatHistory.length > CHAT_HISTORY_LIMIT) {
    globalChatHistory.splice(0, globalChatHistory.length - CHAT_HISTORY_LIMIT);
  }
}

function updateMessageInHistory(messageId: string | null, updates: Partial<ChatMessage>): ChatMessage | null {
  if (messageId === null) {
    return null;
  }
  const message = globalChatHistory.find((msg) => msg.id === messageId);
  if (message) {
    Object.assign(message, updates);
    return message;
  }
  return null;
}

function deleteMessageInHistory(messageId: string, admin: boolean = false): ChatMessage | null {
  const message = globalChatHistory.find((msg) => msg.id === messageId);
  if (message) {
    message.text = admin ? '[deleted by admin]' : '[message deleted]';
    (message as any).deleted = true;
    return message;
  }
  return null;
}

function checkSpam(userId: number, isAdmin: boolean = false): { isSpam: boolean; waitTime?: number; slowMode?: boolean; userData?: any } {
  const now = Date.now();
  const userData = chatSpamTracker.get(userId) || { lastTime: 0, violations: 0 };

  if (now - userData.lastTime > 60000) {
    userData.violations = 0;
  }

  const BASE_COOLDOWN = 3000;
  const PENALTY_PER_VIOLATION = 5000;
  const requiredCooldown = BASE_COOLDOWN + userData.violations * PENALTY_PER_VIOLATION;

  if (now - userData.lastTime < requiredCooldown) {
    userData.violations++;
    chatSpamTracker.set(userId, userData);
    return { isSpam: true, waitTime: Math.ceil((requiredCooldown - (now - userData.lastTime)) / 1000) };
  }

  const slowModeInterval = (global as any).globalChatSettings?.slowModeInterval || 0;
  if (slowModeInterval > 0 && !isAdmin) {
    if (now - userData.lastTime < slowModeInterval * 1000) {
      return { isSpam: true, waitTime: Math.ceil((slowModeInterval * 1000 - (now - userData.lastTime)) / 1000), slowMode: true };
    }
  }

  return { isSpam: false, userData };
}

function updateSpamTracker(userId: number, now: number): void {
  const userData = chatSpamTracker.get(userId) || { lastTime: 0, violations: 0 };
  userData.lastTime = now;
  chatSpamTracker.set(userId, userData);
}

function filterContent(text: string): boolean {
  const filters = (global as any).chatFilters;
  let isFiltered = false;

  if (filters.regexes && filters.regexes.length > 0) {
    isFiltered = filters.regexes.some((r: RegExp) => r.test(text));
  }

  if (!isFiltered && filters.badWords && filters.badWords.length > 0) {
    const lowerMsg = text.toLowerCase();
    isFiltered = filters.badWords.some((w: string) => lowerMsg.includes(w));
  }

  return isFiltered;
}

export {
  loadChatFilters,
  getChatHistory,
  addMessageToHistory,
  updateMessageInHistory,
  deleteMessageInHistory,
  checkSpam,
  updateSpamTracker,
  filterContent,
  CHAT_PAGE_SIZE
};

export default {
  loadChatFilters,
  getChatHistory,
  addMessageToHistory,
  updateMessageInHistory,
  deleteMessageInHistory,
  checkSpam,
  updateSpamTracker,
  filterContent,
  CHAT_PAGE_SIZE
};
