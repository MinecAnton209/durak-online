<script setup>
import { onMounted, ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHistoryStore } from '@/stores/history';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const historyStore = useHistoryStore();
const authStore = useAuthStore();

const matchId = route.params.id;
const matchInfo = ref(null);
const analysisData = ref(null);
const loading = ref(true);
const error = ref(null);
const currentStep = ref(0);
const purchasing = ref(false);

const loadMatch = async () => {
    try {
        matchInfo.value = await historyStore.getMatchDetails(matchId);
        if (matchInfo.value?.isAnalyzed || authStore.user?.is_admin) {
            await fetchAnalysis();
        }
    } catch (err) {
        error.value = err.response?.data?.message || err.message;
    } finally {
        loading.value = false;
    }
};

const fetchAnalysis = async () => {
    purchasing.value = true;
    try {
        analysisData.value = await historyStore.purchaseAnalysis(matchId);
        currentStep.value = 0;
    } catch (err) {
        error.value = err.response?.data?.message || err.message;
    } finally {
        purchasing.value = false;
    }
};

onMounted(loadMatch);

// ── Helpers ──────────────────────────────────────────────
const SUIT_COLORS = { '♠': 'text-white', '♣': 'text-white', '♥': 'text-red-400', '♦': 'text-red-400' };

const suitColor = (card) => card?.suit ? (SUIT_COLORS[card.suit] || 'text-white') : 'text-white';

const EVAL_META = {
    'Best Move': { color: 'text-emerald-400', bg: 'bg-emerald-400/20', dot: 'bg-emerald-400', icon: '✦' },
    'Best': { color: 'text-emerald-400', bg: 'bg-emerald-400/20', dot: 'bg-emerald-400', icon: '✦' },
    'Best (Forced)': { color: 'text-sky-400', bg: 'bg-sky-400/20', dot: 'bg-sky-400', icon: '◆' },
    'Excellent': { color: 'text-blue-400', bg: 'bg-blue-400/20', dot: 'bg-blue-400', icon: '●' },
    'Good': { color: 'text-green-400', bg: 'bg-green-400/20', dot: 'bg-green-400', icon: '●' },
    'Inaccuracy': { color: 'text-yellow-400', bg: 'bg-yellow-400/20', dot: 'bg-yellow-400', icon: '▲' },
    'Mistake': { color: 'text-orange-400', bg: 'bg-orange-400/20', dot: 'bg-orange-400', icon: '✕' },
    'Blunder': { color: 'text-red-400', bg: 'bg-red-400/20', dot: 'bg-red-400', icon: '✕' },
};
const getEvalMeta = (label) => EVAL_META[label] || { color: 'text-white/40', bg: 'bg-white/5', dot: 'bg-white/20', icon: '·' };

// ── State reconstruction at currentStep ─────────────────
const gameState = computed(() => {
    if (!analysisData.value) return null;
    const { history, initialHands } = analysisData.value;
    if (!history || !initialHands) return null;

    const hands = {};
    for (const [uid, cards] of Object.entries(initialHands)) {
        hands[uid] = [...(Array.isArray(cards) ? cards : [])];
    }
    const table = [];
    let trumpSuit = null;

    for (let i = 0; i <= currentStep.value && i < history.length; i++) {
        const action = history[i];
        if (!action) continue;
        if (action.trumpSuit) trumpSuit = action.trumpSuit;

        const uid = String(action.userId ?? action.playerId);
        if (uid === 'null' || action.playerName === 'System') continue;

        // Find best possible hand key (numeric ID or player name)
        let handKey = uid;
        if (!hands[handKey]) {
            if (action.playerName && hands[action.playerName]) {
                handKey = action.playerName;
            } else if (hands["null"] && (uid.startsWith('bot_') || uid === 'null')) {
                handKey = "null";
            } else if (uid.startsWith('bot_')) {
                // Fallback: finding any key that looks like a bot name if direct match fails
                const botKey = Object.keys(hands).find(k => k === action.playerName || k.includes('Bot') || k === 'null');
                if (botKey) handKey = botKey;
            }
        }

        if (!hands[handKey]) hands[handKey] = [];

        if (action.type === 'attack' || action.type === 'toss') {
            const card = action.data?.card;
            const idx = hands[handKey].findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
            if (idx !== -1) hands[handKey].splice(idx, 1);
            if (card) table.push({ attack: card, defense: null });
        } else if (action.type === 'defend') {
            const card = action.data?.card;
            const idx = hands[handKey].findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
            if (idx !== -1) hands[handKey].splice(idx, 1);
            const pair = table.find(p => !p.defense);
            if (pair && card) pair.defense = card;
        } else if (action.type === 'take') {
            table.forEach(p => { hands[handKey].push(p.attack); if (p.defense) hands[handKey].push(p.defense); });
            table.length = 0;
        } else if (action.type === 'pass') {
            table.length = 0;
        } else if (action.type === 'draw') {
            if (Array.isArray(action.data?.cards)) hands[handKey].push(...action.data.cards);
        }
    }

    return { hands, table, trumpSuit };
});

const currentAction = computed(() => {
    if (!analysisData.value) return null;
    return analysisData.value.history?.[currentStep.value] || null;
});

const currentEval = computed(() => {
    if (!analysisData.value) return null;
    return analysisData.value.analysis?.[currentStep.value]?.evaluation || null;
});

const totalSteps = computed(() => analysisData.value?.history?.length ?? 0);

// ── Stats ────────────────────────────────────────────────
const playerStats = computed(() => {
    if (!analysisData.value) return [];
    const { analysis, participants } = analysisData.value;
    const stats = {};
    participants?.forEach(p => {
        const uid = String(p.user_id ?? p.username);
        stats[uid] = { name: p.username, best: 0, good: 0, ok: 0, mistake: 0, blunder: 0 };
    });
    analysis?.forEach((a, idx) => {
        const historyAction = analysisData.value.history?.[idx];
        const uid = String(a.userId ?? historyAction?.userId);
        const name = historyAction?.playerName;

        // Skip System/Start/etc.
        if (uid === 'null' || name === 'System' || !a.evaluation) return;

        // Find bucket by ID or name
        let key = uid;
        if (!stats[key] && name && stats[name]) key = name;
        if (!stats[key]) {
            // Only add if it's not system
            stats[key] = { name: name || uid, best: 0, good: 0, ok: 0, mistake: 0, blunder: 0 };
        }

        const label = a.evaluation?.label || '';
        if (label.startsWith('Best')) stats[key].best++;
        else if (label === 'Excellent' || label === 'Good') stats[key].good++;
        else if (label === 'Inaccuracy') stats[key].ok++;
        else if (label === 'Mistake') stats[key].mistake++;
        else if (label === 'Blunder') stats[key].blunder++;
    });
    return Object.entries(stats).map(([id, s]) => ({ id, ...s }));
});

const myUserId = computed(() => String(authStore.user?.id));

const moveList = ref(null);

watch(currentStep, async () => {
    await nextTick();
    const activeEl = moveList.value?.querySelector('.bg-white\\/10');
    if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});

const nav = (step) => {
    currentStep.value = Math.max(0, Math.min(totalSteps.value - 1, step));
};

const myStat = computed(() => playerStats.value.find(s => String(s.id) === String(myUserId.value)) ?? null);

const goBack = () => router.push('/history');

const fmt = (seconds) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const actionLabel = (action) => {
    const labels = { attack: '⚔️', defend: '🛡️', take: '📥', pass: '✅', toss: '➕', draw: '🃏' };
    return labels[action] ?? action;
};
</script>

<template>
    <div class="h-[100dvh] bg-background flex flex-col select-none overflow-hidden">

        <!-- Header -->
        <header class="flex items-center gap-3 px-4 py-3 border-b border-white/8 bg-surface/50 backdrop-blur-lg z-20">
            <button @click="goBack" class="p-2 rounded-full hover:bg-white/10 transition-colors">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <div class="flex-1 min-w-0">
                <h1 class="text-base font-bold text-white truncate">{{ t('history.analyze_title') }}</h1>
                <div v-if="matchInfo" class="text-[11px] text-white/40">{{ matchId }} · {{ fmt(matchInfo.duration) }}
                </div>
            </div>
            <div v-if="matchInfo" class="text-right shrink-0">
                <div class="text-[10px] text-white/40 uppercase tracking-wide">{{ t('admin_table_result') }}</div>
                <div class="text-sm font-bold"
                    :class="matchInfo.loser === authStore.user?.username ? 'text-red-400' : 'text-emerald-400'">
                    {{ matchInfo.loser === authStore.user?.username ? t('lose_title') : t('win_title') }}
                </div>
            </div>
        </header>

        <!-- Loading / Error -->
        <div v-if="loading" class="flex-1 flex items-center justify-center">
            <div class="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>

        <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
            <span class="text-5xl">⚠️</span>
            <p class="text-red-400 font-medium max-w-sm">{{ error }}</p>
            <button @click="goBack"
                class="mt-2 px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm transition-colors">
                {{ t('history.back_to_history') }}
            </button>
        </div>

        <!-- Purchase prompt -->
        <div v-else-if="!analysisData && !purchasing"
            class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-6">
            <div class="text-6xl">🧐</div>
            <div>
                <h2 class="text-2xl font-bold text-white mb-2">{{ t('history.analyze_title') }}</h2>
                <p class="text-white/50 text-sm max-w-xs">{{ t('history.analysis_expired', { cost: 250 }) }}</p>
            </div>
            <button @click="fetchAnalysis"
                class="flex items-center gap-2 px-8 py-3 bg-primary hover:brightness-110 text-black font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-primary/30 text-lg">
                ⚡️ {{ t('history.analyze_btn') }} — 250 🪙
            </button>
        </div>

        <!-- Purchasing spinner -->
        <div v-else-if="purchasing" class="flex-1 flex flex-col items-center justify-center gap-4">
            <div class="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p class="text-white/50 text-sm">Analysing…</p>
        </div>

        <!-- Main Analysis UI -->
        <div v-else-if="analysisData" class="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

            <!-- LEFT: Move list -->
            <aside
                class="w-full md:w-56 border-b md:border-b-0 md:border-r border-white/8 bg-surface/20 flex flex-col shrink-0 min-h-0">
                <div class="p-3 border-b border-white/8 shrink-0">
                    <p class="text-[10px] text-white/40 uppercase tracking-widest">Move History</p>
                </div>
                <div ref="moveList" class="flex-1 overflow-y-auto divide-y divide-white/5 max-h-48 md:max-h-none">
                    <button v-for="(action, idx) in analysisData.history" :key="idx" @click="currentStep = idx"
                        class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5"
                        :class="currentStep === idx ? 'bg-white/10' : ''">
                        <!-- eval dot -->
                        <span class="w-2 h-2 rounded-full shrink-0"
                            :class="getEvalMeta(analysisData.analysis?.[idx]?.evaluation?.label).dot"></span>
                        <!-- step number -->
                        <span class="text-[10px] text-white/30 w-5 shrink-0">{{ idx + 1 }}</span>
                        <!-- action icon + card -->
                        <span class="text-xs text-white/60">{{ actionLabel(action.type) }}</span>
                        <span v-if="action.data?.card" class="text-xs font-bold shrink-0"
                            :class="suitColor(action.data.card)">
                            {{ action.data.card.rank }}{{ action.data.card.suit }}
                        </span>
                    </button>
                </div>
            </aside>

            <!-- CENTER: Board -->
            <main class="flex-1 flex flex-col min-w-0 overflow-y-auto min-h-0">

                <!-- Trump & step info bar -->
                <div class="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-surface/10">
                    <div class="flex items-center gap-2 text-sm">
                        <span class="text-white/40 text-xs uppercase tracking-wide">Trump</span>
                        <span v-if="gameState?.trumpSuit" class="font-bold text-lg"
                            :class="suitColor({ suit: gameState.trumpSuit })">{{ gameState.trumpSuit }}</span>
                        <span v-else class="text-white/20">—</span>
                    </div>
                    <div class="text-xs text-white/40">{{ currentStep + 1 }} / {{ totalSteps }}</div>
                </div>

                <!-- Evaluation banner -->
                <div v-if="currentEval" class="flex items-center gap-3 px-4 py-2 border-b border-white/8 transition-all"
                    :class="getEvalMeta(currentEval.label).bg">
                    <span class="font-bold text-lg" :class="getEvalMeta(currentEval.label).color">{{
                        getEvalMeta(currentEval.label).icon }}</span>
                    <div class="min-w-0">
                        <div class="text-sm font-bold" :class="getEvalMeta(currentEval.label).color">{{
                            currentEval.label }}</div>
                        <div v-if="currentEval.reason" class="text-[11px] text-white/50 truncate">{{ currentEval.reason
                        }}</div>
                    </div>
                </div>

                <!-- Table area (center) -->
                <div class="flex-1 flex flex-col items-center justify-center gap-6 p-4">

                    <!-- Opponent hands (top) -->
                    <div class="flex gap-6 flex-wrap justify-center">
                        <div v-for="(hand, uid) in gameState?.hands" :key="uid">
                            <div v-if="String(uid) !== myUserId" class="flex flex-col items-center gap-1">
                                <div class="text-[10px] text-white/30 uppercase">
                                    {{analysisData.participants?.find(p => String(p.user_id) === String(uid))?.is_bot ?
                                        '🤖 Bot' : '👤 Opponent'}}
                                </div>
                                <div class="flex -space-x-3">
                                    <div v-for="n in hand.length" :key="n"
                                        class="w-7 h-10 rounded-md bg-surface border border-white/15 shadow flex items-center justify-center text-[10px] text-white/20">
                                        🂠
                                    </div>
                                    <div v-if="hand.length === 0" class="text-[10px] text-white/20 italic px-2">empty
                                    </div>
                                </div>
                                <div class="text-[10px] text-white/20">{{ hand.length }} cards</div>
                            </div>
                        </div>
                    </div>

                    <!-- Table cards -->
                    <div
                        class="flex flex-wrap justify-center gap-3 min-h-[80px] p-4 rounded-2xl bg-white/3 border border-white/6 w-full max-w-lg">
                        <div v-if="!gameState?.table.length" class="text-white/20 italic text-sm self-center">Table is
                            empty</div>
                        <div v-for="(pair, idx) in gameState?.table" :key="idx"
                            class="flex flex-col items-center gap-1">
                            <!-- Attack card -->
                            <div class="w-10 h-14 rounded-lg border flex flex-col items-center justify-center shadow-lg"
                                :class="pair.attack?.suit && ['♥', '♦'].includes(pair.attack.suit)
                                    ? 'bg-white border-red-300/30 text-red-500'
                                    : 'bg-white border-white/20 text-gray-900'">
                                <span class="text-[11px] font-black leading-none">{{ pair.attack?.rank }}</span>
                                <span class="text-[14px] leading-none">{{ pair.attack?.suit }}</span>
                            </div>
                            <!-- Defense card -->
                            <div v-if="pair.defense"
                                class="w-10 h-14 rounded-lg border flex flex-col items-center justify-center shadow-lg"
                                :class="pair.defense?.suit && ['♥', '♦'].includes(pair.defense.suit)
                                    ? 'bg-white border-red-300/30 text-red-500'
                                    : 'bg-white border-white/20 text-gray-900'">
                                <span class="text-[11px] font-black leading-none">{{ pair.defense?.rank }}</span>
                                <span class="text-[14px] leading-none">{{ pair.defense?.suit }}</span>
                            </div>
                            <div v-else
                                class="w-10 h-14 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-white/20 text-xs">
                                ?
                            </div>
                        </div>
                    </div>

                    <!-- MY hand -->
                    <div class="flex flex-col items-center gap-1">
                        <div class="text-[10px] text-white/30 uppercase">{{ authStore.user?.username || 'You' }}</div>
                        <div class="flex flex-wrap justify-center gap-1">
                            <div v-for="(card, i) in gameState?.hands?.[myUserId]" :key="i"
                                class="w-9 h-13 rounded-md border flex flex-col items-center justify-center shadow-md cursor-default"
                                :class="card.suit && ['♥', '♦'].includes(card.suit)
                                    ? 'bg-white border-red-300/30 text-red-500'
                                    : 'bg-white border-white/20 text-gray-900'">
                                <span class="text-[10px] font-black leading-none">{{ card.rank }}</span>
                                <span class="text-[12px] leading-none">{{ card.suit }}</span>
                            </div>
                            <div v-if="!gameState?.hands?.[myUserId]?.length" class="text-[11px] text-white/20 italic">
                                no cards</div>
                        </div>
                    </div>
                </div>

                <!-- Navigation controls -->
                <div class="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/8 bg-surface/10">
                    <button @click="nav(0)" :disabled="currentStep === 0"
                        class="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                        </svg>
                    </button>
                    <button @click="nav(currentStep - 1)" :disabled="currentStep === 0"
                        class="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                    </button>
                    <div class="flex-1 flex justify-center">
                        <!-- Progress bar -->
                        <div class="w-40 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full bg-primary rounded-full transition-all"
                                :style="{ width: totalSteps > 1 ? `${(currentStep / (totalSteps - 1)) * 100}%` : '100%' }">
                            </div>
                        </div>
                    </div>
                    <button @click="nav(currentStep + 1)" :disabled="currentStep >= totalSteps - 1"
                        class="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                        </svg>
                    </button>
                    <button @click="nav(totalSteps - 1)" :disabled="currentStep >= totalSteps - 1"
                        class="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 18l8.5-6L6 6v12zm2-8.14 4.77 2.14L8 14.14V9.86zM16 6h2v12h-2z" />
                        </svg>
                    </button>
                </div>
            </main>

            <!-- RIGHT: Stats sidebar -->
            <aside
                class="w-full md:w-52 border-t md:border-t-0 md:border-l border-white/8 bg-surface/20 flex-shrink-0 flex flex-col shrink-0 min-h-0 overflow-y-auto">
                <!-- Players -->
                <div class="p-4 border-b border-white/8">
                    <p class="text-[10px] text-white/40 uppercase tracking-widest mb-3">Players</p>
                    <div class="space-y-2">
                        <div v-for="p in matchInfo?.players" :key="p.username"
                            class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="w-2 h-2 rounded-full shrink-0"
                                    :class="p.outcome === 'win' ? 'bg-emerald-400' : 'bg-red-400'"></span>
                                <span class="text-xs text-white truncate">{{ p.username }}</span>
                            </div>
                            <span v-if="p.cardsTaken" class="text-[10px] text-white/30 shrink-0">+{{ p.cardsTaken
                            }}</span>
                        </div>
                    </div>
                </div>

                <!-- Move quality summary -->
                <div class="p-4">
                    <p class="text-[10px] text-white/40 uppercase tracking-widest mb-3">My Summary</p>
                    <div v-if="myStat" class="space-y-1.5">
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-emerald-400">Best / Excellent</span>
                            <span class="text-white font-bold">{{ myStat.best + myStat.good }}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-yellow-400">Inaccuracy</span>
                            <span class="text-white font-bold">{{ myStat.ok }}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-orange-400">Mistake</span>
                            <span class="text-white font-bold">{{ myStat.mistake }}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-red-400">Blunder</span>
                            <span class="text-white font-bold">{{ myStat.blunder }}</span>
                        </div>
                    </div>
                    <p v-else class="text-white/20 text-xs">No data</p>
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.h-13 {
    height: 3.25rem;
}
</style>
