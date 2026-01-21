<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useTelegramStore } from '@/stores/telegram';
import { useNotificationStore } from '@/stores/notifications';
import { useI18n } from 'vue-i18n';

import Card from '@/components/game/Card.vue';
import AuthModal from '@/components/ui/AuthModal.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import SessionsModal from '@/components/ui/SessionsModal.vue';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToastStore();
const tgStore = useTelegramStore();
const notifStore = useNotificationStore();
const { t } = useI18n();

const styles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
const currentStyle = ref(authStore.user?.card_back_style || 'default');

const quickDeckSize = ref(authStore.user?.pref_quick_deck_size || 36);
const quickMaxPlayers = ref(authStore.user?.pref_quick_max_players || 2);
const quickGameMode = ref(authStore.user?.pref_quick_game_mode || 'podkidnoy');
const quickIsBetting = ref(authStore.user?.pref_quick_is_betting || false);
const quickBetAmount = ref(authStore.user?.pref_quick_bet_amount || 10);

const isAuthModalOpen = ref(false);
const isUnlinkConfirmOpen = ref(false);
const isSessionsModalOpen = ref(false);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const isChangingPassword = ref(false);
const isPasswordModalOpen = ref(false);

const isSaving = ref(false);

watch(() => authStore.user, (newUser) => {
  if (newUser) {
    if (newUser.card_back_style) currentStyle.value = newUser.card_back_style;
    if (newUser.pref_quick_deck_size) quickDeckSize.value = newUser.pref_quick_deck_size;
    if (newUser.pref_quick_max_players) quickMaxPlayers.value = newUser.pref_quick_max_players;
    if (newUser.pref_quick_game_mode) quickGameMode.value = newUser.pref_quick_game_mode;
    if (newUser.pref_quick_is_betting !== undefined) quickIsBetting.value = newUser.pref_quick_is_betting;
    if (newUser.pref_quick_bet_amount) quickBetAmount.value = newUser.pref_quick_bet_amount;
  }
}, { immediate: true });

const saveSettings = async (updates) => {
  if (!authStore.isAuthenticated) {
    return toast.addToast(t('settings_login_required'), 'warning');
  }

  isSaving.value = true;
  try {
    await authStore.updateSettings(updates)
    toast.addToast(t('settings_saved_success'), 'success');
  } catch {
    toast.addToast(t('settings_connection_error'), 'error');
  } finally {
    isSaving.value = false;
  }
};

const saveCardStyle = (style) => {
  currentStyle.value = style;
  saveSettings({ card_back_style: style });
};

const toggleNotifications = () => {
  if (notifStore.isSubscribed) notifStore.unsubscribe();
  else notifStore.subscribe();
};

const handleLinkTelegram = () => { tgStore.linkAccount(); };
const handleUnlinkTelegram = () => { isUnlinkConfirmOpen.value = true; };
const onConfirmUnlink = () => {
  authStore.unlinkTelegram();
  isUnlinkConfirmOpen.value = false;
};

const openMergeAccountModal = () => { isAuthModalOpen.value = true; };
const handleAuthSubmit = async ({ mode, username, password, initData, onComplete }) => {
  try {
    await authStore.authenticate(mode, { username, password, initData });
    onComplete(null);
    isAuthModalOpen.value = false;
    toast.addToast(t('telegram_linked_title'), 'success');
    setTimeout(() => window.location.reload(), 1000);
  } catch (e) {
    onComplete(e.message || t('error_generic'));
  }
};

const submitPasswordChange = async () => {
  if (!authStore.isAuthenticated) {
    return toast.addToast(t('settings_login_required'), 'warning');
  }
  const np = newPassword.value.trim();
  const cp = confirmPassword.value.trim();
  const op = currentPassword.value.trim();
  if (!op || !np || !cp) {
    return toast.addToast(t('error_fill_fields'), 'error');
  }
  if (np.length < 6) {
    return toast.addToast(t('password_too_short', { min: 6 }), 'error');
  }
  if (np !== cp) {
    return toast.addToast(t('passwords_mismatch'), 'error');
  }
  isChangingPassword.value = true;
  const ok = await authStore.changePassword({ currentPassword: op, newPassword: np });
  isChangingPassword.value = false;
  if (ok) {
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    isPasswordModalOpen.value = false;
  }
};

onMounted(() => {
  if (!authStore.isAuthenticated && !authStore.isAuthChecking) {
    router.push('/');
  }
});

watch(() => authStore.isAuthenticated, (val) => {
  if (!val && !authStore.isAuthChecking) {
    router.push('/');
  }
});
</script>

<template>
  <div v-if="authStore.isAuthenticated"
    class="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden font-sans">

    <div
      class="w-full max-w-2xl bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 p-6 md:p-8 animate-fade-in my-auto">
      <h1 class="text-3xl font-bold text-white mb-8 text-center">{{ $t('settings_title') }}</h1>

      <div class="mb-8">
        <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">{{
          $t('choose_card_back') }}</h3>
        <div class="flex flex-wrap gap-4 md:gap-6 justify-center">
          <div v-for="style in styles" :key="style" class="flex flex-col items-center gap-3 cursor-pointer group"
            @click="saveCardStyle(style)">
            <div class="transition-all duration-200 p-1 rounded-xl"
              :class="currentStyle === style ? 'ring-4 ring-primary scale-105' : 'opacity-70 group-hover:opacity-100'">
              <Card :is-back="true" :card-style="style" class="pointer-events-none shadow-xl" />
            </div>
            <span class="text-sm font-medium capitalize"
              :class="currentStyle === style ? 'text-primary' : 'text-on-surface-variant'">{{ style }}</span>
          </div>
        </div>
      </div>

      <div class="mb-8 w-full border-t border-white/10 pt-6">
        <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">Telegram</h3>

        <div v-if="authStore.user?.telegram_id"
          class="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-center max-w-sm mx-auto">
          <div class="flex items-center justify-center gap-2">
            <svg class="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.4-1.08.39-.35-.01-1.03-.2-1.54-.37-.62-.21-1.12-.32-1.08-.67.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z" />
            </svg>
            <p class="text-blue-300 font-bold text-sm">{{ $t('telegram_linked_title') }}</p>
          </div>
          <p class="text-xs text-white/50 mt-2">{{ $t('telegram_linked_info') }}</p>
          <button @click="handleUnlinkTelegram"
            class="mt-3 text-xs text-error/70 hover:text-error underline transition-colors">{{ $t('unlink_button')
            }}</button>
        </div>

        <div v-else-if="tgStore.isTelegram && authStore.isAuthenticated" class="flex flex-col items-center gap-2">
          <button @click="handleLinkTelegram"
            class="w-full max-w-sm py-3 px-6 rounded-xl font-bold transition-all bg-[#24A1DE] text-white hover:bg-[#1b8bbf] shadow-lg flex items-center justify-center gap-2">
            {{ $t('link_current_telegram', { username: authStore.user?.username }) }}
          </button>
          <p class="text-xs text-on-surface-variant">{{ $t('or_label') }}</p>
          <button @click="openMergeAccountModal" class="text-sm text-primary hover:underline">
            {{ $t('login_other_and_link') }}
          </button>
        </div>

        <div v-else class="text-center text-sm text-on-surface-variant bg-white/5 p-3 rounded-xl max-w-sm mx-auto">
          {{ $t('open_via_telegram_hint') }}
        </div>
      </div>

      <!-- Quick Game Defaults -->
      <div class="mb-8 w-full border-t border-white/10 pt-6">
        <h3 class="text-on-surface-variant mb-6 font-bold uppercase text-xs tracking-wider text-center">{{
          $t('settings_quick_game_title') }}</h3>

        <div class="space-y-6 max-w-md mx-auto">
          <!-- Deck Size -->
          <div class="space-y-2">
            <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">{{
              $t('settings_quick_deck_size') }}</label>
            <div class="flex bg-black/20 p-1 rounded-2xl border border-white/5">
              <button v-for="size in [24, 36, 52]" :key="size"
                @click="quickDeckSize = size; saveSettings({ pref_quick_deck_size: size })"
                class="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                :class="quickDeckSize === size ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-white'">
                {{ size }}
              </button>
            </div>
          </div>

          <!-- Max Players -->
          <div class="space-y-2">
            <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">{{
              $t('settings_quick_max_players') }}</label>
            <div class="flex bg-black/20 p-1 rounded-2xl border border-white/5">
              <button v-for="count in [2, 3, 4]" :key="count"
                @click="quickMaxPlayers = count; saveSettings({ pref_quick_max_players: count })"
                class="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                :class="quickMaxPlayers === count ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-white'">
                {{ count }}
              </button>
            </div>
          </div>

          <!-- Game Mode -->
          <div class="space-y-2">
            <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">{{
              $t('settings_quick_game_mode') }}</label>
            <div class="flex bg-black/20 p-1 rounded-2xl border border-white/5">
              <button @click="quickGameMode = 'podkidnoy'; saveSettings({ pref_quick_game_mode: 'podkidnoy' })"
                class="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                :class="quickGameMode === 'podkidnoy' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-white'">
                {{ $t('game_mode_podkidnoy') }}
              </button>
              <button @click="quickGameMode = 'perevodnoy'; saveSettings({ pref_quick_game_mode: 'perevodnoy' })"
                class="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                :class="quickGameMode === 'perevodnoy' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-white'">
                {{ $t('game_mode_perevodnoy') }}
              </button>
            </div>
          </div>

          <!-- Betting -->
          <div class="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5">
            <div>
              <p class="font-bold text-white text-sm">{{ $t('settings_quick_is_betting') }}</p>
              <p class="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">{{
                $t('bet_toggle_sublabel') }}</p>
            </div>
            <button @click="quickIsBetting = !quickIsBetting; saveSettings({ pref_quick_is_betting: quickIsBetting })"
              class="w-14 h-7 rounded-full transition-all relative p-1"
              :class="quickIsBetting ? 'bg-primary' : 'bg-white/10'">
              <div class="w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                :class="quickIsBetting ? 'translate-x-7' : 'translate-x-0'"></div>
            </button>
          </div>

          <!-- Bet Amount -->
          <div v-if="quickIsBetting" class="space-y-2 animate-fade-in">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1 text-center block w-full">{{
                $t('settings_quick_bet_amount') }}: {{ quickBetAmount }} 💰</label>
            <input type="range" v-model.number="quickBetAmount" min="10" max="1000" step="10"
              @change="saveSettings({ pref_quick_bet_amount: quickBetAmount })"
              class="w-full accent-primary bg-white/10 rounded-lg h-2" />
          </div>
        </div>
      </div>

      <!-- Sessions Manage Button -->
      <div class="mb-8 w-full border-t border-white/10 pt-6">
        <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">{{
          $t('settings_active_sessions') }}</h3>
        <div class="max-w-sm mx-auto text-center">
          <button @click="isSessionsModalOpen = true"
            class="w-full py-3 px-6 rounded-xl font-bold transition-all bg-surface-variant/20 hover:bg-surface-variant/40 text-on-surface border border-white/10">
            🛡️ {{ $t('settings_active_sessions') }}
          </button>
        </div>
      </div>

      <div class="mb-8 w-full border-t border-white/10 pt-6">
        <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">{{
          $t('password_change_title') }}</h3>
        <div class="max-w-sm mx-auto text-center">
          <button @click="isPasswordModalOpen = true"
            class="w-full py-3 px-6 rounded-xl font-bold transition-all bg-primary text-on-primary shadow-lg hover:shadow-primary/40">
            {{ $t('password_change_title') }}
          </button>
        </div>
      </div>

      <div class="mb-8 w-full border-t border-white/10 pt-6">
        <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">{{
          $t('notifications_title') }}</h3>

        <div v-if="!notifStore.isSupported" class="text-center text-error text-sm bg-error/10 p-2 rounded-lg">
          {{ $t('notifications_unsupported') }}
        </div>

        <div v-else class="flex flex-col items-center gap-2">
          <button @click="toggleNotifications" :disabled="notifStore.isLoading || notifStore.permission === 'denied'"
            class="w-full max-w-sm py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            :class="notifStore.isSubscribed
              ? 'bg-error/10 text-error border border-error/20 hover:bg-error/20'
              : 'bg-primary text-on-primary shadow-lg hover:shadow-primary/40'">
            <span v-if="notifStore.isLoading" class="animate-spin">⏳</span>
            <span v-else>{{ notifStore.isSubscribed ? $t('notifications_disable') : $t('notifications_enable') }}</span>
          </button>

          <p v-if="notifStore.permission === 'denied'" class="text-xs text-error mt-2 font-bold">
            🚫 {{ $t('notifications_denied') }}
          </p>
          <p v-else class="text-xs text-on-surface-variant text-center max-w-xs mt-2">
            {{ $t('notifications_info') }}
          </p>
        </div>
      </div>

      <button @click="router.push('/')"
        class="w-full py-4 rounded-xl border border-outline/30 text-on-surface hover:bg-white/5 transition-colors font-bold">
        {{ $t('go_home') }}
      </button>
    </div>

    <AuthModal :is-open="isAuthModalOpen" mode="login" @close="isAuthModalOpen = false" @submit="handleAuthSubmit" />

    <ConfirmModal :is-open="isUnlinkConfirmOpen" :title="$t('confirm_unlink_title')"
      :message="$t('confirm_unlink_message')" :confirm-text="$t('confirm_unlink')" @confirm="onConfirmUnlink"
      @cancel="isUnlinkConfirmOpen = false" />

    <SessionsModal :is-open="isSessionsModalOpen" @close="isSessionsModalOpen = false" />

    <transition name="fade">
      <div v-if="isPasswordModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div class="w-full max-w-sm bg-surface/95 border border-white/10 rounded-2xl shadow-2xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-white text-lg font-bold">{{ $t('password_change_title') }}</h3>
            <button class="text-on-surface-variant hover:text-white" @click="isPasswordModalOpen = false">✕</button>
          </div>
          <div class="flex flex-col gap-3">
            <input v-model="currentPassword" type="password" :placeholder="$t('current_password_label')"
              class="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" />
            <input v-model="newPassword" type="password" :placeholder="$t('new_password_label')"
              class="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" />
            <input v-model="confirmPassword" type="password" :placeholder="$t('confirm_password_label')"
              class="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" />
            <div class="flex gap-2 mt-2">
              <button @click="isPasswordModalOpen = false"
                class="flex-1 py-3 rounded-xl border border-outline/30 text-on-surface hover:bg-white/5 font-bold">{{
                  $t('go_home') }}</button>
              <button @click="submitPasswordChange" :disabled="isChangingPassword"
                class="flex-1 py-3 rounded-xl font-bold bg-primary text-on-primary shadow-lg hover:shadow-primary/40 disabled:opacity-60">
                <span v-if="isChangingPassword" class="animate-spin">⏳</span>
                <span v-else>{{ $t('password_change_submit') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
  <div v-else class="min-h-screen flex items-center justify-center p-4 bg-background">
    <div
      class="w-full max-w-md bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 p-6 md:p-8 text-center">
      <h2 class="text-2xl font-bold text-white mb-2">{{ $t('settings_title') }}</h2>
      <p class="text-on-surface-variant">{{ $t('settings_login_required') }}</p>
    </div>
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
