<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useHistoryStore } from '@/stores/history';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const router = useRouter();
const historyStore = useHistoryStore();
const authStore = useAuthStore();

const container = ref(null);

onMounted(async () => {
    if (!authStore.isAuthenticated) {
        router.push('/');
        return;
    }
    await historyStore.fetchHistory(true);
});

const handleScroll = () => {
    if (!container.value) return;
    const { scrollTop, scrollHeight, clientHeight } = container.value;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
        historyStore.fetchHistory();
    }
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getOutcome = (match) => {
    if (match.winner_id === authStore.user.id) return 'win';
    if (match.winner_id === null) return 'draw';
    return 'loss';
};

const viewAnalysis = (id) => {
    router.push(`/analysis/${id}`);
};

const goBack = () => {
    router.push('/');
};
</script>

<template>
    <div class="min-h-screen bg-background p-4 flex flex-col items-center">
        <div class="w-full max-w-2xl flex flex-col h-[90vh]">
            <!-- Header -->
            <div class="flex items-center justify-between mb-6 animate-fade-in-down">
                <button @click="goBack"
                    class="p-2 bg-surface/50 rounded-full hover:bg-surface text-on-surface transition-all active:scale-95 border border-white/5">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 class="text-2xl font-bold text-white tracking-tight">{{ t('history.title') }}</h1>
                <div class="w-10"></div> <!-- Balance spacer -->
            </div>

            <!-- Match List -->
            <div ref="container" @scroll="handleScroll"
                class="flex-1 overflow-y-auto bg-surface/30 backdrop-blur-md rounded-3xl border border-white/5 p-4 custom-scrollbar space-y-3 animate-fade-in">
                <div v-if="historyStore.matches.length === 0 && !historyStore.loading"
                    class="flex flex-col items-center justify-center h-full text-on-surface-variant">
                    <span class="text-5xl mb-4 opacity-20">📅</span>
                    <p>{{ t('history.no_matches') }}</p>
                </div>

                <div v-for="match in historyStore.matches" :key="match.id"
                    class="group bg-surface/40 hover:bg-surface/60 rounded-2xl p-4 border border-white/5 transition-all cursor-pointer relative overflow-hidden flex items-center justify-between"
                    @click="viewAnalysis(match.id)">
                    <!-- Outcome Indicator -->
                    <div class="absolute left-0 top-0 bottom-0 w-1.5" :class="{
                        'bg-primary': getOutcome(match) === 'win',
                        'bg-error': getOutcome(match) === 'loss',
                        'bg-on-surface-variant': getOutcome(match) === 'draw'
                    }"></div>

                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" :class="{
                                'bg-primary/20 text-primary': getOutcome(match) === 'win',
                                'bg-error/20 text-error': getOutcome(match) === 'loss',
                                'bg-white/10 text-on-surface-variant': getOutcome(match) === 'draw'
                            }">
                                {{ t('history.outcome_' + getOutcome(match)) }}
                            </span>
                            <span class="text-on-surface-variant text-xs">{{ formatDate(match.created_at) }}</span>
                        </div>
                        <div class="text-white font-medium">
                            {{ match.type || 'Classic' }} • {{ match.deck_size }} cards
                        </div>
                        <div class="text-on-surface-variant text-xs flex items-center gap-1">
                            <span v-for="(p, i) in match.participants" :key="p.id">
                                {{ p.user.username }}{{ i < match.participants.length - 1 ? ', ' : '' }} </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <div v-if="match.bet_amount" class="flex flex-col items-end">
                            <span class="text-sm font-bold"
                                :class="getOutcome(match) === 'win' ? 'text-primary' : 'text-error'">
                                {{ getOutcome(match) === 'win' ? '+' : '-' }}{{ match.bet_amount }} 💰
                            </span>
                        </div>
                        <svg class="w-5 h-5 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>

                <!-- Loading Indicator -->
                <div v-if="historyStore.loading" class="flex justify-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}

.animate-fade-in {
    animation: fadeIn 0.4s ease-out;
}

.animate-fade-in-down {
    animation: fadeInDown 0.4s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeInDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
