<script setup>
import { ref, watchEffect, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useGameStore } from '@/stores/game';
import { useInboxStore } from '@/stores/inbox';
import { useI18n } from 'vue-i18n';

import AuthModal from '@/components/ui/AuthModal.vue';
import LeaderboardModal from '@/components/ui/LeaderboardModal.vue';
import InboxModal from '@/components/ui/InboxModal.vue';
import MyGamesModal from '@/components/ui/MyGamesModal.vue';

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const gameStore = useGameStore();
const inboxStore = useInboxStore();

const playerName = ref('');

const isAuthModalOpen = ref(false);
const authMode = ref('login');
const isLeaderboardOpen = ref(false);
const isInboxOpen = ref(false);
const isMyGamesOpen = ref(false);

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
    // Fetch unread count and sync sessionId
    if (authStore.isAuthenticated) {
      inboxStore.fetchUnreadCount();
      if (authStore.user.sessionId) {
        inboxStore.currentSessionId = authStore.user.sessionId;
      }
    }
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
    window.location.reload();
  } catch (err) {
    onComplete(err.message || t('error_generic'));
  }
};

const handleLogout = async () => {
  if (confirm(t('confirm_logout'))) {
    await authStore.logout();
    window.location.reload();
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
  <div class="min-h-screen flex items-center justify-center p-4 md:p-6 relative overflow-hidden bg-background">

    <button v-if="authStore.isAuthenticated" @click="router.push('/settings')"
      class="absolute top-4 left-4 z-10 text-2xl p-2 min-h-[48px] bg-surface/50 rounded-full hover:bg-surface text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg"
      :title="$t('settings_tooltip')">
      ⚙️
    </button>
    <button v-if="authStore.user?.is_admin" @click="router.push('/admin')"
      class="absolute top-4 left-16 z-10 text-2xl p-2 min-h-[48px] bg-surface/50 rounded-full hover:bg-surface text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg"
      title="Admin Panel">
      🛠️
    </button>

    <div class="absolute top-4 right-4 flex gap-2 z-10">
      <button @click="setLang('uk')" :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'uk' }"
        class="text-2xl min-h-[48px] hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
        :title="$t('lang_uk')">🇺🇦</button>
      <button @click="setLang('en')" :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'en' }"
        class="text-2xl min-h-[48px] hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
        :title="$t('lang_en')">🇬🇧</button>
      <button @click="setLang('ru')" :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'ru' }"
        class="text-2xl min-h-[48px] hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
        :title="$t('lang_ru')">🇷🇺</button>
    </div>

    <div
      class="w-full max-w-md bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 flex flex-col max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto animate-fade-in">

      <div class="p-4 sm:p-6 md:p-8 pb-0 text-center">
        <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 tracking-wide drop-shadow-md">
          {{ $t('welcome_title') }}
        </h1>
        <p class="text-on-surface-variant text-xs sm:text-sm">{{ $t('tagline_online') }}</p>
      </div>

      <div class="p-4 sm:p-6 md:p-8 flex flex-col gap-3 sm:gap-5">

        <div v-if="authStore.isAuthChecking" class="flex justify-center py-3">
          <svg class="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none"
            viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>

        <div v-else-if="!authStore.isAuthenticated" class="flex gap-2 sm:gap-3">
          <button @click="openAuth('login')"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2 px-3 min-h-[44px] rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center text-sm">
            <span>{{ $t('login_button') }}</span>
          </button>
          <button @click="openAuth('register')"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2 px-3 min-h-[44px] rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center text-sm">
            {{ $t('register_button') }}
          </button>
        </div>

        <div v-else class="flex gap-2 animate-fade-in">
          <div
            class="flex-1 bg-primary/10 rounded-xl p-2 border border-primary/30 flex items-center justify-center gap-2 relative min-w-0">
            <div class="flex items-center justify-center gap-1.5 w-full">
              <span class="text-lg shrink-0">👤</span>
              <span class="text-primary font-bold truncate text-xs sm:text-sm md:text-base">{{ authStore.user?.username }}</span>
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
          <button @click="isInboxOpen = true"
            class="px-2 sm:px-3 bg-transparent border border-outline/30 text-outline hover:bg-white/5 hover:border-outline hover:text-white min-h-[44px] rounded-xl transition-all active:scale-95 shrink-0 relative"
            title="Inbox">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z">
              </path>
            </svg>
            <span v-if="inboxStore.unreadCount > 0"
              class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[1.2em] h-[1.2em] flex items-center justify-center border border-[#1a1a2e]">
              {{ inboxStore.unreadCount > 9 ? '9+' : inboxStore.unreadCount }}
            </span>
          </button>
          <button @click="handleLogout"
            class="px-3 sm:px-4 bg-transparent border border-error/30 text-error hover:bg-error/10 hover:border-error min-h-[44px] rounded-xl transition-colors active:scale-95 shrink-0"
            :title="$t('logout_title')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
          </button>
        </div>

        <div class="flex gap-2 sm:gap-3">
          <button @click="isLeaderboardOpen = true"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2 px-3 sm:px-4 min-h-[44px] rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span>🏆</span> {{ $t('leaderboard_button') }}
          </button>
          <button @click="router.push('/roulette')"
            class="flex-1 bg-transparent border border-outline/50 text-on-surface font-medium py-2 px-3 sm:px-4 min-h-[44px] rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span>🎰</span> {{ $t('roulette_button') }}
          </button>
        </div>

        <button v-if="authStore.isAuthenticated" @click="isMyGamesOpen = true"
          class="w-full bg-transparent border border-outline/50 text-on-surface font-medium py-2.5 min-h-[44px] rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2 text-sm">
          <span>🎮</span> {{ $t('my_games_button') }}
        </button>

        <div class="relative flex py-0.5 items-center">
          <div class="flex-grow border-t border-outline/30"></div>
          <span class="flex-shrink-0 mx-3 text-outline text-[10px] uppercase tracking-widest font-semibold">{{
            $t('or_separator') }}</span>
          <div class="flex-grow border-t border-outline/30"></div>
        </div>

        <div v-if="!authStore.isAuthenticated" class="space-y-1">
          <label class="text-[10px] sm:text-xs font-bold text-on-surface-variant uppercase tracking-wider ml-1">{{
            $t('guest_name_label') }}</label>
          <div class="relative">
            <input type="text" v-model="playerName"
              class="w-full bg-black/20 border border-outline/50 rounded-xl px-3 py-2 sm:py-3 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all pl-9 text-sm"
              :placeholder="$t('placeholder_name')">
            <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" fill="none" stroke="currentColor"
              viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:gap-3" :class="{ 'mt-2': authStore.isAuthenticated }">
          <button @click="quickPlay"
            class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-base sm:text-lg py-3 min-h-[48px] rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
            ⚡️ {{ $t('quick_play_button') }}
          </button>
          <button @click="goToLobbyBrowser"
            class="w-full bg-transparent border border-outline/50 text-on-surface font-medium py-2.5 min-h-[44px] rounded-xl hover:bg-white/5 hover:border-outline hover:text-white transition-all active:scale-95">
            🚪 {{ $t('lobby_browser_button') }}
          </button>
        </div>
      </div>
    </div>

    <AuthModal :is-open="isAuthModalOpen" :mode="authMode" @close="isAuthModalOpen = false"
      @submit="handleAuthSubmit" />
    <LeaderboardModal :is-open="isLeaderboardOpen" @close="isLeaderboardOpen = false" />
    <InboxModal :is-open="isInboxOpen" @close="isInboxOpen = false" />
    <MyGamesModal :is-open="isMyGamesOpen" @close="isMyGamesOpen = false" />
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
