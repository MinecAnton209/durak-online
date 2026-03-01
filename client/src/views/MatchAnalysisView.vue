<script setup>
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHistoryStore } from '@/stores/history';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';
import Card from '@/components/game/Card.vue';

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
const currentStep = ref(-1); // -1 is initial state
const purchasing = ref(false);

const loadMatch = async () => {
    try {
        matchInfo.value = await historyStore.getMatchDetails(matchId);
        if (matchInfo.value.isAnalyzed || authStore.user?.is_admin) {
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

// State Reconstruction Logic
const gameState = computed(() => {
    if (!analysisData.value) return null;

    const { history, initialHands, participants } = analysisData.value;
    const hands = JSON.parse(JSON.stringify(initialHands));
    const table = []; // Array of { attack: Card, defense?: Card }
    let trumpCard = history[0]?.trumpSuit || '♠'; // Fallback

    // Reconstruct up to currentStep
    for (let i = 0; i <= currentStep.value; i++) {
        const action = history[i];
        if (!action) continue;

        const playerHand = hands[action.userId];

        if (action.action === 'attack' || action.action === 'toss') {
            // Find card in hand and remove it
            const cardIdx = playerHand.findIndex(c => c.rank === action.card.rank && c.suit === action.card.suit);
            if (cardIdx !== -1) playerHand.splice(cardIdx, 1);
            table.push({ attack: action.card });
        } else if (action.action === 'defend') {
            const cardIdx = playerHand.findIndex(c => c.rank === action.card.rank && c.suit === action.card.suit);
            if (cardIdx !== -1) playerHand.splice(cardIdx, 1);
            // Find the undefended card on table
            const undefended = table.find(pair => !pair.defense);
            if (undefended) undefended.defense = action.card;
        } else if (action.action === 'take') {
            // Add all table cards to player hand
            table.forEach(pair => {
                playerHand.push(pair.attack);
                if (pair.defense) playerHand.push(pair.defense);
            });
            table.length = 0;
        } else if (action.action === 'pass') {
            table.length = 0;
        }

        // Draw cards logic usually happens at end of turn, but history should record it if we want full sync.
        // In our simplified history, we assume playerHand is correct if we subtract played cards.
        // Wait, history records 'draw' actions too if we implemented it. Let's check.
        if (action.action === 'draw') {
            playerHand.push(...action.cards);
        }
    }

    return { hands, table, trumpCard };
});

const currentEvaluation = computed(() => {
    if (!analysisData.value || currentStep.value < 0) return null;
    return analysisData.value.analysis[currentStep.value];
});

const nextStep = () => {
    if (currentStep.value < analysisData.value.history.length - 1) {
        currentStep.value++;
    }
};

const prevStep = () => {
    if (currentStep.value > 0) {
        currentStep.value--;
    }
};

const getEvalClass = (quality) => {
    switch (quality) {
        case 'Best Move': return 'text-primary bg-primary/20';
        case 'Excellent': return 'text-blue-400 bg-blue-400/20';
        case 'Good': return 'text-green-400 bg-green-400/20';
        case 'Inaccuracy': return 'text-yellow-400 bg-yellow-400/20';
        case 'Mistake': return 'text-orange-400 bg-orange-400/20';
        case 'Blunder': return 'text-error bg-error/20';
        default: return 'text-on-surface-variant bg-white/10';
    }
};

const getEvalLabel = (quality) => {
    const key = quality.toLowerCase().replace(' ', '_');
    return t(`history.move_${key}`);
};

const goBack = () => {
    router.push('/history');
};
</script>

<template>
    <div class="min-h-screen bg-background overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="p-4 flex items-center justify-between border-b border-white/5 bg-surface/30 backdrop-blur-md z-10">
            <div class="flex items-center gap-4">
                <button @click="goBack" class="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 class="text-xl font-bold text-white">{{ t('history.analyze_title') }}</h1>
            </div>

            <div v-if="matchInfo" class="text-right">
                <div class="text-xs text-on-surface-variant uppercase tracking-wider">{{ t('history.playing_as') }}
                </div>
                <div class="text-primary font-bold">{{ authStore.user?.username }}</div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 relative flex flex-col md:flex-row h-full overflow-hidden">

            <!-- Replay Area -->
            <div
                class="flex-1 flex flex-col p-4 gap-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-surface/20 to-transparent">

                <div v-if="loading" class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>

                <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <span class="text-6xl mb-4">⚠️</span>
                    <p class="text-error text-lg font-medium max-w-md">{{ error }}</p>
                    <button @click="goBack"
                        class="mt-6 px-6 py-2 bg-surface hover:bg-surface/80 rounded-xl transition-all border border-white/10">
                        {{ t('history.back_to_history') }}
                    </button>
                </div>

                <!-- Purchase Overlay -->
                <div v-else-if="!analysisData && !purchasing"
                    class="flex-1 flex flex-col items-center justify-center text-center p-8 bg-black/40 backdrop-blur-sm rounded-3xl m-4 border border-white/5">
                    <span class="text-6xl mb-6">🧐</span>
                    <h2 class="text-2xl font-bold text-white mb-2">{{ t('history.analyze_title') }}</h2>
                    <p class="text-on-surface-variant max-w-sm mb-8">
                        {{ t('history.analysis_expired', { cost: 250 }) }}
                    </p>
                    <button @click="fetchAnalysis"
                        class="px-8 py-4 bg-primary hover:bg-[#00A891] text-on-primary font-bold text-lg rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2">
                        <span>⚡️</span> {{ t('history.analyze_btn') }}
                    </button>
                </div>

                <template v-else-if="analysisData">
                    <!-- Game Board Replay -->
                    <div class="flex-1 flex flex-col items-center justify-center relative min-h-[300px]">

                        <!-- Trump Indicator -->
                        <div
                            class="absolute top-0 right-0 p-3 bg-surface/50 rounded-2xl border border-white/5 flex flex-col items-center">
                            <span class="text-xs text-on-surface-variant uppercase">{{ t('deck_size_label') }}</span>
                            <span class="text-2xl">{{ gameState.trumpCard }}</span>
                        </div>

                        <!-- Table -->
                        <div
                            class="flex flex-wrap justify-center gap-4 max-w-4xl p-8 rounded-3xl bg-white/5 border border-white/5 shadow-inner">
                            <div v-if="gameState.table.length === 0"
                                class="text-on-surface-variant/20 italic text-lg select-none">
                                {{ t('chat_empty') }}
                            </div>
                            <div v-for="(pair, idx) in gameState.table" :key="idx" class="relative group">
                                <div class="flex flex-col gap-2">
                                    <Card v-bind="pair.attack" class="shadow-2xl" />
                                    <Card v-if="pair.defense" v-bind="pair.defense"
                                        class="absolute top-6 left-6 shadow-2xl" />
                                </div>
                            </div>
                        </div>

                        <!-- Current Player Hand (Requester) -->
                        <div class="absolute bottom-0 w-full flex flex-col items-center gap-2 px-4">
                            <div class="text-xs text-on-surface-variant uppercase tracking-widest">{{ t('you_label') }}
                            </div>
                            <div
                                class="flex flex-wrap justify-center -space-x-8 hover:space-x-1 transition-all duration-300 pb-4">
                                <Card v-for="(card, idx) in gameState.hands[authStore.user.id]" :key="idx"
                                    v-bind="card" />
                            </div>
                        </div>

                        <!-- Opponent Hands (Simplified) -->
                        <div class="absolute top-0 w-full flex flex-wrap justify-center gap-8 px-4 opacity-60">
                            <div v-for="(hand, uid) in gameState.hands" :key="uid">
                                <div v-if="uid != authStore.user.id" class="flex flex-col items-center">
                                    <div class="text-[10px] text-on-surface-variant uppercase mb-1">
                                        {{analysisData.participants.find(p => p.user_id == uid)?.is_bot ? 'Bot' :
                                        'Opponent' }}
                                    </div>
                                    <div class="flex -space-x-12 scale-50 origin-top">
                                        <Card v-for="n in hand.length" :key="n" :isBack="true" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Controls -->
                    <div
                        class="p-6 bg-surface/40 backdrop-blur-md rounded-3xl border border-white/5 flex flex-col gap-4">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div v-if="currentEvaluation"
                                    class="px-3 py-1.5 rounded-xl font-bold text-sm transition-all"
                                    :class="getEvalClass(currentEvaluation.evaluation)">
                                    {{ getEvalLabel(currentEvaluation.evaluation) }}
                                </div>
                                <div class="text-on-surface-variant text-sm font-medium">
                                    {{ currentStep + 1 }} / {{ analysisData.history.length }}
                                </div>
                            </div>

                            <div class="flex gap-2">
                                <button @click="prevStep"
                                    class="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all active:scale-90"
                                    :disabled="currentStep <= 0">
                                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                                    </svg>
                                </button>
                                <button @click="nextStep"
                                    class="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all active:scale-90"
                                    :disabled="currentStep >= analysisData.history.length - 1">
                                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <!-- Best Move Tooltip -->
                        <div v-if="currentEvaluation?.evaluation === 'Mistake' || currentEvaluation?.evaluation === 'Blunder'"
                            class="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-start gap-3 animate-fade-in">
                            <span class="text-2xl">💡</span>
                            <div>
                                <p class="text-white text-sm font-bold">{{ t('history.move_best') }}?</p>
                                <p class="text-on-surface-variant text-xs mt-1">
                                    {{ currentEvaluation.reason }}
                                </p>
                            </div>
                        </div>
                        <div v-else-if="currentEvaluation"
                            class="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3">
                            <span class="text-2xl">✅</span>
                            <div>
                                <p class="text-white text-sm font-bold">{{ getEvalLabel(currentEvaluation.evaluation) }}
                                </p>
                                <p class="text-on-surface-variant text-xs mt-1">
                                    {{ currentEvaluation.reason }}
                                </p>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Info Sidebar -->
            <div
                class="w-full md:w-80 border-l border-white/5 bg-surface/30 backdrop-blur-md p-6 flex flex-col gap-6 overflow-y-auto">
                <h3 class="text-lg font-bold text-white mb-2">{{ t('status_label') }}</h3>

                <div v-if="matchInfo" class="space-y-4">
                    <div class="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <div class="text-xs text-on-surface-variant uppercase mb-1">{{ t('admin_table_result') }}</div>
                        <div class="text-xl font-bold"
                            :class="matchInfo.loser === authStore.user.username ? 'text-error' : 'text-primary'">
                            {{ matchInfo.loser === authStore.user.username ? t('lose_title') : t('win_title') }}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                            <div class="text-[10px] text-on-surface-variant uppercase mb-1">Taken</div>
                            <div class="text-lg font-bold text-white">{{matchInfo.players.find(p => p.username ===
                                authStore.user.username)?.cardsTaken || 0 }}</div>
                        </div>
                        <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                            <div class="text-[10px] text-on-surface-variant uppercase mb-1">Duration</div>
                            <div class="text-lg font-bold text-white">{{ matchInfo.duration }}s</div>
                        </div>
                    </div>

                    <div class="mt-8">
                        <h4 class="text-xs text-on-surface-variant uppercase tracking-widest mb-4">Players</h4>
                        <div class="space-y-3">
                            <div v-for="p in matchInfo.players" :key="p.username"
                                class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="w-2 h-2 rounded-full"
                                        :class="p.outcome === 'winner' ? 'bg-primary' : 'bg-error'"></span>
                                    <span class="text-white text-sm font-medium">{{ p.username }}</span>
                                </div>
                                <span v-if="p.cardsTaken" class="text-xs text-on-surface-variant">+{{ p.cardsTaken }}
                                    taken</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Move List Overlay (Mini) -->
                <div v-if="analysisData" class="flex-1 mt-6">
                    <h4 class="text-xs text-on-surface-variant uppercase tracking-widest mb-4">Move History</h4>
                    <div class="space-y-1 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div v-for="(action, idx) in analysisData.history" :key="idx" @click="currentStep = idx"
                            class="p-2 rounded-lg cursor-pointer transition-all flex items-center justify-between group"
                            :class="currentStep === idx ? 'bg-primary/20 border border-primary/20' : 'hover:bg-white/5 border border-transparent'">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] text-on-surface-variant w-4">{{ idx + 1 }}</span>
                                <span class="text-xs text-white">{{ action.action }}</span>
                                <span v-if="action.card" class="text-[10px] text-primary">{{ action.card.rank }}{{
                                    action.card.suit
                                    }}</span>
                            </div>
                            <div v-if="analysisData.analysis[idx]" class="w-2 h-2 rounded-full"
                                :class="getEvalClass(analysisData.analysis[idx].evaluation).replace('text-', 'bg-').split(' ')[0]">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}

.animate-fade-in {
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: scale(0.95);
    }

    to {
        opacity: 1;
        transform: scale(1);
    }
}
</style>
