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

const playerName = ref(t('default_guest_name') + ' ' + Math.floor(Math.random() * 1000));
const deckSize = ref("36");
const playersCount = ref("2");
const isBetting = ref(false);
const betAmount = ref(10);

const isAuthModalOpen = ref(false);
const authMode = ref('login');
const isLeaderboardOpen = ref(false);

onMounted(() => {
  if (route.query.gameId) {
    router.push(`/game/${route.query.gameId}`);
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
    onComplete(t(err.message));
  }
};

const handleLogout = async () => {
  if (confirm(t('confirm_logout'))) {
    await authStore.logout();
    playerName.value = t('default_guest_name') + ' ' + Math.floor(Math.random() * 1000);
  }
};

const toggleBet = () => {
  isBetting.value = !isBetting.value;
};

const createGame = () => {
  if (!playerName.value.trim()) {
    alert(t('error_fill_fields'));
    return;
  }

  const settings = {
    playerName: playerName.value,
    deckSize: parseInt(deckSize.value),
    maxPlayers: parseInt(playersCount.value),
    betAmount: isBetting.value ? betAmount.value : 0
  };

  gameStore.createGame(settings);
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">

    <button @click="router.push('/settings')"
            class="absolute top-4 left-4 z-10 text-2xl p-2 bg-surface/50 rounded-full hover:bg-surface text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg"
            :title="$t('settings_tooltip')">
      ⚙️
    </button>

    <div class="absolute top-4 right-4 flex gap-2 z-10">
      <button @click="setLang('uk')"
              class="text-2xl hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
              :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'uk' }" :title="$t('lang_uk')">
        🇺🇦
      </button>
      <button @click="setLang('en')"
              class="text-2xl hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
              :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'en' }" :title="$t('lang_en')">
        🇬🇧
      </button>
      <button @click="setLang('ru')"
              class="text-2xl hover:scale-110 transition-transform cursor-pointer grayscale-[0.5] hover:grayscale-0"
              :class="{ 'grayscale-0 scale-110 drop-shadow-lg': locale === 'ru' }" :title="$t('lang_ru')">
        🇷🇺
      </button>
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

        <div class="space-y-1.5">
          <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wider ml-1">{{
              $t('guest_name_label') }}</label>
          <div class="relative">
            <input type="text" v-model="playerName"
                   class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all pl-10"
                   :placeholder="$t('placeholder_name')" :disabled="authStore.isAuthenticated"
                   :class="{ 'opacity-75 cursor-not-allowed': authStore.isAuthenticated }">
            <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" fill="none" stroke="currentColor"
                 viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wider ml-1">{{
                $t('deck_size_label') }}</label>
            <div class="relative">
              <select v-model="deckSize"
                      class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none cursor-pointer">
                <option value="24" class="bg-surface">{{ $t('deck_24') }}</option>
                <option value="36" class="bg-surface">{{ $t('deck_36') }}</option>
                <option value="52" class="bg-surface">{{ $t('deck_52') }}</option>
              </select>
              <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline"><svg
                class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg></div>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wider ml-1">{{
                $t('players_count_label') }}</label>
            <div class="relative">
              <select v-model="playersCount"
                      class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none cursor-pointer">
                <option value="2" class="bg-surface">{{ $t('players_2') }}</option>
                <option value="3" class="bg-surface">{{ $t('players_3') }}</option>
                <option value="4" class="bg-surface">{{ $t('players_4') }}</option>
              </select>
              <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline"><svg
                class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg></div>
            </div>
          </div>
        </div>

        <div
          class="flex items-center justify-between p-3 rounded-xl border border-transparent transition-colors cursor-pointer"
          :class="isBetting ? 'bg-primary/10 border-primary/30' : 'bg-black/20 hover:bg-black/30'" @click="toggleBet">
          <div class="flex items-center gap-3">
            <span class="text-xl">{{ isBetting ? '💰' : '🎲' }}</span>
            <div class="flex flex-col">
              <span class="font-bold text-sm" :class="isBetting ? 'text-primary' : 'text-on-surface'">{{
                  $t('bet_toggle_label') }}</span>
              <span class="text-xs text-on-surface-variant">{{ isBetting ? $t('bet_toggle_sublabel') :
                $t('bet_toggle_sublabel_simple') }}</span>
            </div>
          </div>
          <div class="w-12 h-6 rounded-full relative transition-colors duration-300"
               :class="isBetting ? 'bg-primary' : 'bg-outline/50'">
            <div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm"
                 :class="{ 'translate-x-6': isBetting }"></div>
          </div>
        </div>

        <transition enter-active-class="transition duration-300 ease-out"
                    enter-from-class="transform -translate-y-2 opacity-0" enter-to-class="transform translate-y-0 opacity-100"
                    leave-active-class="transition duration-200 ease-in" leave-from-class="transform translate-y-0 opacity-100"
                    leave-to-class="transform -translate-y-2 opacity-0">
          <div v-if="isBetting" class="space-y-1.5">
            <label class="text-xs font-bold text-primary uppercase tracking-wider ml-1">{{ $t('bet_amount_label')
              }}</label>
            <div class="relative">
              <input type="number" v-model="betAmount"
                     class="w-full bg-black/20 border rounded-xl px-4 py-3 text-on-surface focus:outline-none transition-all pl-10 border-primary focus:ring-1 focus:ring-primary font-bold text-primary"
                     min="10" step="10">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-primary">💰</span>
            </div>
          </div>
        </transition>

        <button @click="createGame"
                class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-lg py-4 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 mt-2">
          {{ $t('create_game_button') }}
        </button>

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
