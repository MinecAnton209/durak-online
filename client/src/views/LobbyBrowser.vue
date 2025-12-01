<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const router = useRouter();
const gameStore = useGameStore();

const activeTab = ref('find');
const publicLobbies = ref([]);
const isLoading = ref(true);
const inviteCode = ref('');

const lobbyType = ref('public');
const maxPlayers = ref(4);
const deckSize = ref(36);
const isBetting = ref(false);
const betAmount = ref(10);

async function fetchLobbies() {
  isLoading.value = true;
  try {
    const response = await fetch('/api/public/lobbies');
    if (response.ok) {
      publicLobbies.value = await response.json();
    }
  } catch (error) {
    console.error("Failed to fetch lobbies:", error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchLobbies();
});

function joinPublicLobby(gameId) {
  gameStore.joinLobby({ gameId });
}

function joinPrivateLobby() {
  if (inviteCode.value.trim()) {
    gameStore.joinLobby({ inviteCode: inviteCode.value.trim().toUpperCase() });
  }
}

function createLobby() {
  const settings = {
    lobbyType: lobbyType.value,
    maxPlayers: parseInt(maxPlayers.value),
    deckSize: parseInt(deckSize.value),
    betAmount: isBetting.value ? parseInt(betAmount.value) : 0,
  };
  gameStore.createLobby(settings);
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4 bg-background">
    <div class="w-full max-w-2xl bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 flex flex-col max-h-[90vh]">

      <button @click="router.push('/')" class="absolute -top-3 -left-3 z-10 text-xl p-2 bg-surface rounded-full hover:bg-surface-variant text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg" :title="$t('back_to_main_menu')">
        ←
      </button>

      <div class="flex p-2 bg-black/20 rounded-t-3xl">
        <button @click="activeTab = 'find'" class="flex-1 py-3 px-4 rounded-2xl font-bold transition-colors" :class="activeTab === 'find' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'">
          {{ $t('find_game') }}
        </button>
        <button @click="activeTab = 'create'" class="flex-1 py-3 px-4 rounded-2xl font-bold transition-colors" :class="activeTab === 'create' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'">
          {{ $t('create_game') }}
        </button>
      </div>

      <div class="p-6 overflow-y-auto">
        <div v-if="activeTab === 'find'" class="flex flex-col gap-6 animate-fade-in">
          <div>
            <h3 class="font-bold text-lg text-white mb-3">{{ $t('lobby_list_public') }}</h3>
            <div v-if="isLoading" class="text-center py-8 text-on-surface-variant">{{ $t('loading') }}...</div>
            <div v-else-if="publicLobbies.length === 0" class="text-center py-8 text-on-surface-variant">{{ $t('no_public_lobbies') }}</div>
            <div v-else class="space-y-3">
              <div v-for="lobby in publicLobbies" :key="lobby.gameId" class="bg-black/20 p-3 rounded-xl flex items-center justify-between">
                <div class="flex flex-col">
                  <span class="font-bold text-on-surface">#{{ lobby.gameId }} ({{ lobby.hostName }})</span>
                  <span class="text-xs text-on-surface-variant">{{ lobby.playerCount }}/{{ lobby.maxPlayers }} гравців • 💰{{ lobby.betAmount }}</span>
                </div>
                <button @click="joinPublicLobby(lobby.gameId)" class="bg-primary hover:bg-[#00A891] text-on-primary font-bold py-2 px-4 rounded-lg transition-all active:scale-95">{{ $t('join_button') }}</button>
              </div>
              <button @click="fetchLobbies" class="text-sm text-primary hover:underline w-full mt-2">{{ $t('refresh_list') }}</button>
            </div>
          </div>

          <div class="relative flex py-1 items-center">
            <div class="flex-grow border-t border-outline/30"></div><span class="flex-shrink-0 mx-4 text-outline text-xs uppercase">{{ $t('or_separator') }}</span><div class="flex-grow border-t border-outline/30"></div>
          </div>

          <div>
            <h3 class="font-bold text-lg text-white mb-3">{{ $t('join_private_lobby') }}</h3>
            <div class="flex gap-2">
              <input type="text" v-model="inviteCode" class="flex-1 w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary" :placeholder="$t('enter_code_placeholder')">
              <button @click="joinPrivateLobby" class="bg-surface-variant hover:bg-on-surface-variant/20 text-on-surface font-bold py-2 px-5 rounded-lg transition-all active:scale-95">{{ $t('join_button') }}</button>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'create'" class="flex flex-col gap-5 animate-fade-in">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="lobby-type" class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('lobby_type') }}</label>
              <select id="lobby-type" v-model="lobbyType" class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary appearance-none">
                <option value="public" class="bg-surface">{{ $t('lobby_public') }}</option>
                <option value="private" class="bg-surface">{{ $t('lobby_private') }}</option>
              </select>
            </div>
            <div>
              <label for="max-players" class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('players_count_label') }}</label>
              <select id="max-players" v-model="maxPlayers" class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary appearance-none">
                <option value="2" class="bg-surface">2</option>
                <option value="3" class="bg-surface">3</option>
                <option value="4" class="bg-surface">4</option>
              </select>
            </div>
            <div>
              <label for="deck-size" class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('deck_size_label') }}</label>
              <select id="deck-size" v-model="deckSize" class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary appearance-none">
                <option value="36" class="bg-surface">36 {{ $t('deck_size_36_desc') }}</option>
                <option value="24" class="bg-surface">24 {{ $t('deck_size_24_desc') }}</option>
              </select>
            </div>
          </div>

          <div
            class="flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer"
            :class="isBetting ? 'bg-primary/10 border-primary/30' : 'bg-black/20 border-white/10 hover:bg-black/30'"
            @click="isBetting = !isBetting"
          >
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6" :class="isBetting ? 'text-primary' : 'text-on-surface-variant'" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V9m0 3v1m0 3v1m-4 1h8a2 2 0 002-2V7a2 2 0 00-2-2h-8a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              <span class="font-bold" :class="isBetting ? 'text-primary' : 'text-white'">{{ $t('enable_betting') }}</span>
            </div>
            <div class="w-5 h-5 rounded-full border-2 transition-all" :class="isBetting ? 'bg-primary border-primary' : 'border-on-surface-variant'"></div>
          </div>

          <div v-if="isBetting" class="space-y-1.5 p-4 bg-black/20 rounded-xl">
            <label for="bet-amount" class="text-xs font-bold text-primary uppercase ml-1 flex items-center gap-1">
              {{ $t('bet_amount_label') }}
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-8V9a1 1 0 012 0v1a1 1 0 11-2 0zm-1 4a1 1 0 102 0 1 1 0 00-2 0z" clip-rule="evenodd"></path></svg>
            </label>
            <input
              id="bet-amount"
              type="number"
              v-model="betAmount"
              min="10"
              step="5"
              class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary"
              :placeholder="$t('min_bet_placeholder', { amount: 10 })"
            >
          </div>

          <button @click="createLobby" class="w-full bg-primary hover:bg-primary/90 text-on-primary font-bold text-lg py-4 rounded-2xl shadow-lg mt-2 transition-all active:scale-95">
            {{ $t('create_lobby_button') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
}
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239CA3AF'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 1.5em 1.5em;
}
</style>
