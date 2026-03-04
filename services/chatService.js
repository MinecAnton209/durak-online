const prisma = require('../db/prisma');

const chatSpamTracker = new Map();
const globalChatHistory = [];
const CHAT_HISTORY_LIMIT = 50;
const CHAT_PAGE_SIZE = 50;

global.globalChatSettings = {
    slowModeInterval: 0 // in seconds
};

global.chatFilters = {
    badWords: [],
    regexes: []
};

async function loadChatFilters() {
    try {
        const filters = await prisma.chatFilter.findMany({
            where: { is_enabled: true },
            select: { type: true, content: true }
        });

        const defaultLinkRegex = '(http:\\/\\/|https:\\/\\/|www\\.)';
        const hasLinkRegex = filters.some(f => f.type === 'regex' && f.content === defaultLinkRegex);

        if (!hasLinkRegex) {
            console.log('Autoseeding default link regex...');
            try {
                await prisma.chatFilter.create({ data: { type: 'regex', content: defaultLinkRegex } });
                filters.push({ type: 'regex', content: defaultLinkRegex });
            } catch (seedErr) {
                console.error('Error autoseeding link regex:', seedErr);
            }
        }

        const words = [];
        const regexes = [];

        filters.forEach(f => {
            if (f.type === 'word') words.push(f.content.toLowerCase());
            if (f.type === 'regex') {
                try {
                    regexes.push(new RegExp(f.content, 'i'));
                } catch (e) {
                    console.error(`Invalid regex in DB: ${f.content}`, e);
                }
            }
        });

        global.chatFilters.badWords = words;
        global.chatFilters.regexes = regexes;

        console.log(`✅ Loaded ${words.length} bad words and ${regexes.length} regex filters.`);

    } catch (error) {
        console.error('❌ Failed to load chat filters:', error);
    }
}

function getChatHistory(beforeTimestamp = null) {
    if (!beforeTimestamp) {
        return globalChatHistory.slice(-CHAT_PAGE_SIZE);
    }
    const lastIndex = globalChatHistory.findIndex(msg => msg.timestamp < beforeTimestamp);
    if (lastIndex > -1) {
        const startIndex = Math.max(0, lastIndex - CHAT_PAGE_SIZE);
        return {
            messages: globalChatHistory.slice(startIndex, lastIndex),
            hasMore: startIndex > 0
        };
    }
    return { messages: [], hasMore: false };
}

function addMessageToHistory(message) {
    globalChatHistory.push(message);
    if (globalChatHistory.length > CHAT_HISTORY_LIMIT) {
        globalChatHistory.splice(0, globalChatHistory.length - CHAT_HISTORY_LIMIT);
    }
}

function updateMessageInHistory(messageId, updates) {
    const message = globalChatHistory.find(msg => msg.id === messageId);
    if (message) {
        Object.assign(message, updates);
        return message;
    }
    return null;
}

function deleteMessageInHistory(messageId, admin = false) {
    const message = globalChatHistory.find(msg => msg.id === messageId);
    if (message) {
        message.text = admin ? '[deleted by admin]' : '[message deleted]';
        message.deleted = true;
        return message;
    }
    return null;
}

function checkSpam(userId, isAdmin = false) {
    const now = Date.now();
    const userData = chatSpamTracker.get(userId) || { lastTime: 0, violations: 0 };

    if (now - userData.lastTime > 60000) {
        userData.violations = 0;
    }

    const BASE_COOLDOWN = 3000;
    const PENALTY_PER_VIOLATION = 5000;
    const requiredCooldown = BASE_COOLDOWN + (userData.violations * PENALTY_PER_VIOLATION);

    if (now - userData.lastTime < requiredCooldown) {
        userData.violations++;
        chatSpamTracker.set(userId, userData);
        return { isSpam: true, waitTime: Math.ceil((requiredCooldown - (now - userData.lastTime)) / 1000) };
    }

    // Slow mode check
    const slowModeInterval = global.globalChatSettings.slowModeInterval;
    if (slowModeInterval > 0 && !isAdmin) {
        if (now - userData.lastTime < slowModeInterval * 1000) {
            return { isSpam: true, waitTime: Math.ceil((slowModeInterval * 1000 - (now - userData.lastTime)) / 1000), slowMode: true };
        }
    }

    return { isSpam: false, userData };
}

function updateSpamTracker(userId, now) {
    const userData = chatSpamTracker.get(userId) || { lastTime: 0, violations: 0 };
    userData.lastTime = now;
    chatSpamTracker.set(userId, userData);
}

function filterContent(text) {
    const filters = global.chatFilters;
    let isFiltered = false;

    if (filters.regexes && filters.regexes.length > 0) {
        isFiltered = filters.regexes.some(r => r.test(text));
    }

    if (!isFiltered && filters.badWords && filters.badWords.length > 0) {
        const lowerMsg = text.toLowerCase();
        isFiltered = filters.badWords.some(w => lowerMsg.includes(w));
    }

    return isFiltered;
}

module.exports = {
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
