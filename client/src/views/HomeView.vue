<script setup>
import { ref, watchEffect, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useGameStore } from '@/stores/game';
import { useI18n } from 'vue-i18n';

import AuthModal from '@/components/ui/AuthModal.vue';
import LeaderboardModal from '@/components/ui/LeaderboardModal.vue';

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const gameStore = useGameStore();

const playerName = ref('');

const isAuthModalOpen = ref(false);
const authMode = ref('login');
const isLeaderboardOpen = ref(false);

onMounted(() => {
  if (route.query.gameId) {
    router.push(`/game/${route.query.gameId}`);
  }
  if (!authStore.isAuthenticated) {
    playerName.value = t('default_guest_name') + ' ' + Math.floor(Math.random() * 1000);
  }
});

watchEffect(() => {
  if (authStore.user && authStore.user.username) {
    playerName.value = authStore.user.username;
  }
});

const setLang = (lang) => {
  locale.value = lang;
  localStorage.setItem('language', lang);
};

const openAuth = (mode) => {
  authMode.value = mode;
  isAuthModalOpen.value = true;
};

const handleAuthSubmit = async ({ mode, username, password, onComplete }) => {
  try {
    await authStore.authenticate(mode, { username, password });
    onComplete(null);
    isAuthModalOpen.value = false;
  } catch (err) {
    onComplete(t(err.message || 'error_generic'));
  }
};

const handleLogout = async () => {
  if (confirm(t('confirm_logout'))) {
    await authStore.logout();
    playerName.value = t('default_guest_name') + ' ' + Math.floor(Math.random() * 1000);
  }
};

const quickPlay = () => {
  if (!authStore.isAuthenticated) {
    if (!playerName.value.trim()) {
      alert(t('error_fill_fields'));
      return;
    }
    gameStore.findAndJoinPublicLobby(playerName.value);
  } else {
    gameStore.findAndJoinPublicLobby();
  }
};

const goToLobbyBrowser = () => {
  router.push('/lobbies');
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4 safe-p relative overflow-hidden bg-background">

    <button v-if="authStore.isAuthenticated" @click="router.push('/settings')"
      class="absolute top-[calc(1rem+var(--safe-area-top))] left-[calc(1rem+var(--safe-area-left))] z-10 text-2xl p-2 bg-surface/50 rounded-full hover:bg-surface text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg"
      :title="$t('settings_tooltip')">
      ⚙️
    </button>

    <div
      class="absolute top-[calc(1rem+var(--safe-area-top))] right-[calc(1rem+var(--safe-area-right))] flex gap-2 z-10">
      <button @click="setLang('uk')" :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'uk' }"
        class="text-2xl hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
        :title="$t('lang_uk')">🇺🇦</button>
      <button @click="setLang('en')" :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'en' }"
        class="text-2xl hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
        :title="$t('lang_en')">🇬🇧</button>
      <button @click="setLang('ru')" :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'ru' }"
        class="text-2xl hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
        :title="$t('lang_ru')">🇷🇺</button>
    </div>

    <div
      class="w-full max-w-md bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 flex flex-col max-h-[90vh] overflow-y-auto animate-fade-in">

      <div class="p-6 md:p-8 pb-0 text-center">
        <h1 class="text-3xl md:text-4xl font-bold text-white mb-2 tracking-wide drop-shadow-md">
          {{ $t('welcome_title') }}
        </h1>
        <p class="text-on-surface-variant text-sm">{{ $t('tagline_online') }}</p>
      </div>

      <div class="p-6 md:p-8 flex flex-col gap-5">

        <div v-if="authStore.isAuthChecking" class="flex justify-center py-3">
          <svg class="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none"
            viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>

        <div v-else-if="!authStore.isAuthenticated" class="flex gap-3">
          <button @click="openAuth('login')"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2.5 px-4 rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center group">
            <span>{{ $t('login_button') }}</span>
          </button>
          <button @click="openAuth('register')"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2.5 px-4 rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center">
            {{ $t('register_button') }}
          </button>
        </div>

        <div v-else class="flex gap-2 animate-fade-in">
          <div
            class="flex-1 bg-primary/10 rounded-xl p-2.5 border border-primary/30 flex items-center justify-center gap-2 relative min-w-0">
            <div class="flex items-center justify-center gap-1.5 w-full">
              <span class="text-xl shrink-0">👤</span>
              <span class="text-primary font-bold truncate text-sm md:text-base">{{ authStore.user?.username }}</span>
              <svg v-if="authStore.user?.isVerified" class="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24"
                fill="currentColor">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div v-if="authStore.user?.streak > 3"
                class="flex items-center text-orange-500 text-xs font-bold bg-orange-500/10 px-1.5 py-0.5 rounded-full border border-orange-500/20 shrink-0">
                <span>🔥</span>
                <span>{{ authStore.user.streak }}</span>
              </div>
            </div>
          </div>
          <button @click="handleLogout"
            class="px-4 bg-transparent border border-error/30 text-error hover:bg-error/10 hover:border-error rounded-xl transition-colors active:scale-95 shrink-0"
            :title="$t('logout_title')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
          </button>
        </div>

        <div class="flex gap-3">
          <button @click="isLeaderboardOpen = true"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2.5 px-4 rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2">
            <span>🏆</span> {{ $t('leaderboard_button') }}
          </button>
          <button @click="router.push('/roulette')"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2.5 px-4 rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2">
            <span>🎰</span> {{ $t('roulette_button') }}
          </button>
        </div>

        <div class="relative flex py-1 items-center">
          <div class="flex-grow border-t border-outline/30"></div>
          <span class="flex-shrink-0 mx-4 text-outline text-xs uppercase tracking-widest font-semibold">{{
            $t('or_separator') }}</span>
          <div class="flex-grow border-t border-outline/30"></div>
        </div>

        <div v-if="!authStore.isAuthenticated" class="space-y-1.5">
          <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wider ml-1">{{
            $t('guest_name_label') }}</label>
          <div class="relative">
            <input type="text" v-model="playerName"
              class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all pl-10"
              :placeholder="$t('placeholder_name')">
            <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" fill="none" stroke="currentColor"
              viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
          </div>
        </div>

        <div class="flex flex-col gap-3" :class="{ 'mt-4': authStore.isAuthenticated }">
          <button @click="quickPlay"
            class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-lg py-4 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
            ⚡️ {{ $t('quick_play_button') }}
          </button>
          <button @click="goToLobbyBrowser"
            class="w-full bg-transparent border border-outline/50 text-on-surface font-medium py-3 rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95">
            🚪 {{ $t('lobby_browser_button') }}
          </button>
        </div>
      </div>
    </div>

    <AuthModal :is-open="isAuthModalOpen" :mode="authMode" @close="isAuthModalOpen = false"
      @submit="handleAuthSubmit" />
    <LeaderboardModal :is-open="isLeaderboardOpen" @close="isLeaderboardOpen = false" />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
