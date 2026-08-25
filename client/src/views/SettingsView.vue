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
    await authStore.updateSettings(updates);
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
    class="min-h-screen flex items-center justify-center p-3 md:p-6 bg-background relative overflow-hidden">

    <div
      class="w-full max-w-2xl lg:max-w-4xl xl:max-w-6xl bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 animate-fade-in my-auto max-h-[100dvh] md:max-h-[90vh] flex flex-col">

      <!-- Fixed header -->
      <div class="shrink-0 p-5 md:p-8 lg:p-10 pb-0 flex items-center gap-3">
        <button @click="router.push('/')"
          class="shrink-0 w-9 h-9 bg-white/5 hover:bg-white/10 rounded-xl text-on-surface transition-all active:scale-90 flex items-center justify-center"
          :title="$t('go_home')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl md:text-2xl font-bold text-white">{{ $t('settings_title') }}</h1>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto px-5 md:px-8 lg:px-10 pb-5 md:pb-8 lg:pb-10 scrollbar-hide">
        <div class="grid grid-cols-1 xl:grid-cols-2 xl:gap-5 xl:items-start">

          <!-- Left column -->
          <div class="space-y-4">

        <!-- Card Backs -->
        <div class="bg-black/20 rounded-2xl border border-white/5 p-4 md:p-5 lg:p-6">
          <div class="flex items-center gap-1.5 mb-4">
            <span class="text-base">🎴</span>
            <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('choose_card_back') }}</span>
            <div class="flex-grow border-t border-outline/20"></div>
          </div>
          <div class="flex gap-3 md:gap-4 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            <div v-for="style in styles" :key="style" class="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
              @click="saveCardStyle(style)">
              <div class="transition-all duration-200 p-0.5 rounded-xl"
                :class="currentStyle === style ? 'ring-2 ring-primary scale-105 shadow-lg shadow-primary/20' : 'opacity-60 group-hover:opacity-100 hover:scale-105'">
                <Card :is-back="true" :card-style="style" class="pointer-events-none shadow-lg !w-14 !h-20 md:!w-16 md:!h-24 lg:!w-24 lg:!h-36" />
              </div>
              <span class="text-[10px] font-medium capitalize"
                :class="currentStyle === style ? 'text-primary' : 'text-on-surface-variant'">{{ style }}</span>
            </div>
          </div>
        </div>

        <!-- Quick Game Defaults -->
        <div class="bg-black/20 rounded-2xl border border-white/5 p-4 md:p-5 lg:p-6">
          <div class="flex items-center gap-1.5 mb-4">
            <svg class="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('settings_quick_game_title') }}</span>
            <div class="flex-grow border-t border-outline/20"></div>
          </div>

          <div class="space-y-3">
            <!-- Deck Size -->
            <div>
              <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('settings_quick_deck_size') }}</label>
              <div class="flex gap-1.5">
                <button v-for="size in [24, 36, 52]" :key="size"
                  @click="quickDeckSize = size; saveSettings({ pref_quick_deck_size: size })"
                  class="flex-1 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 border"
                  :class="quickDeckSize === size ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30'">
                  {{ size }}
                </button>
              </div>
            </div>

            <!-- Max Players + Game Mode row -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('settings_quick_max_players') }}</label>
                <div class="flex gap-1.5">
                  <button v-for="count in [2, 3, 4]" :key="count"
                    @click="quickMaxPlayers = count; saveSettings({ pref_quick_max_players: count })"
                    class="flex-1 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 border"
                    :class="quickMaxPlayers === count ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30'">
                    {{ count }}
                  </button>
                </div>
              </div>
              <div>
                <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('settings_quick_game_mode') }}</label>
                <div class="flex gap-1.5">
                  <button @click="quickGameMode = 'podkidnoy'; saveSettings({ pref_quick_game_mode: 'podkidnoy' })"
                    class="flex-1 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 border"
                    :class="quickGameMode === 'podkidnoy' ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30'">
                    ⬇️
                  </button>
                  <button @click="quickGameMode = 'perevodnoy'; saveSettings({ pref_quick_game_mode: 'perevodnoy' })"
                    class="flex-1 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 border"
                    :class="quickGameMode === 'perevodnoy' ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30'">
                    🔄
                  </button>
                </div>
              </div>
            </div>

            <!-- Betting Toggle -->
            <div class="flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer"
              :class="quickIsBetting ? 'bg-primary/10 border-primary/30' : 'bg-black/20 border-outline/30 hover:bg-black/30'"
              @click="quickIsBetting = !quickIsBetting; saveSettings({ pref_quick_is_betting: quickIsBetting })">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  :class="quickIsBetting ? 'bg-primary/20' : 'bg-white/5'">
                  {{ quickIsBetting ? '💰' : '🎲' }}
                </div>
                <div>
                  <div class="font-bold text-xs" :class="quickIsBetting ? 'text-primary' : 'text-on-surface'">{{ $t('settings_quick_is_betting') }}</div>
                  <div class="text-[9px] text-on-surface-variant/60">{{ quickIsBetting ? $t('bet_toggle_sublabel') : $t('bet_toggle_sublabel_simple') }}</div>
                </div>
              </div>
              <div class="w-11 h-6 rounded-full relative transition-colors duration-300 cursor-pointer select-none"
                :class="quickIsBetting ? 'bg-primary' : 'bg-outline/40'">
                <div class="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all duration-300 shadow-md"
                  :class="quickIsBetting ? 'left-[22px]' : 'left-0.5'"></div>
              </div>
            </div>

            <!-- Bet Amount slider -->
            <div v-if="quickIsBetting" class="animate-fade-in">
              <label class="text-[10px] font-semibold text-primary ml-1 mb-2 flex items-center gap-1">
                💰 {{ $t('settings_quick_bet_amount') }}: <span class="font-black">{{ quickBetAmount }}</span>
              </label>
              <div class="relative px-1">
                <input type="range" v-model.number="quickBetAmount" min="10" max="1000" step="10"
                  @change="saveSettings({ pref_quick_bet_amount: quickBetAmount })"
                  class="w-full accent-primary h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer" />
                <div class="flex justify-between text-[8px] text-on-surface-variant/40 mt-0.5 px-0.5">
                  <span>10</span>
                  <span>250</span>
                  <span>500</span>
                  <span>750</span>
                  <span>1000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>

          <!-- Right column -->
          <div class="space-y-4 mt-4 xl:mt-0">

        <!-- Account -->
        <div class="bg-black/20 rounded-2xl border border-white/5 p-4 md:p-5 lg:p-6">
          <div class="flex items-center gap-1.5 mb-4">
            <span class="text-base">👤</span>
            <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('settings_title') }}</span>
            <div class="flex-grow border-t border-outline/20"></div>
          </div>

          <div class="space-y-2.5">
            <!-- Telegram -->
            <div class="bg-black/20 rounded-xl p-3">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-5 h-5 text-[#24A1DE] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.4-1.08.39-.35-.01-1.03-.2-1.54-.37-.62-.21-1.12-.32-1.08-.67.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/>
                </svg>
                <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Telegram</span>
                <span v-if="authStore.user?.telegram_id" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">✓ {{ $t('telegram_linked_title') }}</span>
              </div>
              <div v-if="authStore.user?.telegram_id">
                <button @click="handleUnlinkTelegram" class="text-[11px] text-error/70 hover:text-error underline transition-colors">{{ $t('unlink_button') }}</button>
              </div>
              <div v-else-if="tgStore.isTelegram">
                <button @click="handleLinkTelegram" class="text-xs bg-[#24A1DE] hover:bg-[#1b8bbf] text-white font-bold py-2 px-4 rounded-xl transition-all active:scale-95">{{ $t('link_current_telegram', { username: authStore.user?.username }) }}</button>
                <button @click="openMergeAccountModal" class="text-xs text-primary hover:underline ml-2">{{ $t('login_other_and_link') }}</button>
              </div>
              <div v-else class="text-[11px] text-on-surface-variant/60">{{ $t('open_via_telegram_hint') }}</div>
            </div>

            <!-- Sessions -->
            <div class="bg-black/20 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:bg-black/30 transition-all" @click="isSessionsModalOpen = true">
              <div class="flex items-center gap-2.5">
                <span class="text-base">🛡️</span>
                <div>
                  <div class="font-bold text-xs text-on-surface">{{ $t('settings_active_sessions') }}</div>
                  <div class="text-[9px] text-on-surface-variant/60">{{ $t('session_device') }}</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-on-surface-variant/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>

            <!-- Password -->
            <div class="bg-black/20 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:bg-black/30 transition-all" @click="isPasswordModalOpen = true">
              <div class="flex items-center gap-2.5">
                <span class="text-base">🔑</span>
                <div>
                  <div class="font-bold text-xs text-on-surface">{{ $t('password_change_title') }}</div>
                  <div class="text-[9px] text-on-surface-variant/60">{{ $t('settings_connection_error') }}</div>
                </div>
              </div>
              <svg class="w-4 h-4 text-on-surface-variant/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Notifications -->
        <div class="bg-black/20 rounded-2xl border border-white/5 p-4 md:p-5 lg:p-6 mb-4">
          <div class="flex items-center gap-1.5 mb-4">
            <span class="text-base">🔔</span>
            <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('notifications_title') }}</span>
            <div class="flex-grow border-t border-outline/20"></div>
          </div>

          <div v-if="!notifStore.isSupported" class="text-center text-xs text-error bg-error/10 p-3 rounded-xl border border-error/20">
            🚫 {{ $t('notifications_unsupported') }}
          </div>
          <div v-else class="flex flex-col items-center gap-3">
            <button @click="toggleNotifications" :disabled="notifStore.isLoading || notifStore.permission === 'denied'"
              class="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
              :class="notifStore.isSubscribed
                ? 'bg-error/10 text-error border border-error/20 hover:bg-error/20'
                : 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:shadow-primary/40'">
              <span v-if="notifStore.isLoading" class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                {{ $t('loading') }}
              </span>
              <span v-else>{{ notifStore.isSubscribed ? $t('notifications_disable') : $t('notifications_enable') }}</span>
            </button>
            <p v-if="notifStore.permission === 'denied'" class="text-xs text-error font-bold">{{ $t('notifications_denied') }}</p>
            <p v-else class="text-[10px] text-on-surface-variant/60 text-center max-w-xs">{{ $t('notifications_info') }}</p>
          </div>
        </div>
          </div>
        </div>

        <!-- Saving indicator + Home -->
        <div class="flex items-center justify-between gap-3">
          <div v-if="isSaving" class="flex items-center gap-2 text-xs text-primary">
            <span class="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            {{ $t('loading') }}
          </div>
          <div v-else></div>
          <button @click="router.push('/')"
            class="bg-black/20 text-on-surface-variant hover:bg-white/5 hover:text-white border border-outline/30 font-bold py-3 px-6 rounded-xl transition-all active:scale-95 text-sm">
            {{ $t('go_home') }}
          </button>
        </div>
      </div>
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
            <button class="text-on-surface-variant hover:text-white p-1" @click="isPasswordModalOpen = false">✕</button>
          </div>
          <div class="flex flex-col gap-3">
            <input v-model="currentPassword" type="password" :placeholder="$t('current_password_label')"
              class="w-full py-3 px-4 rounded-xl bg-black/20 border border-outline/30 text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-all text-sm" />
            <input v-model="newPassword" type="password" :placeholder="$t('new_password_label')"
              class="w-full py-3 px-4 rounded-xl bg-black/20 border border-outline/30 text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-all text-sm" />
            <input v-model="confirmPassword" type="password" :placeholder="$t('confirm_password_label')"
              class="w-full py-3 px-4 rounded-xl bg-black/20 border border-outline/30 text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-all text-sm" />
            <div class="flex gap-2 mt-2">
              <button @click="isPasswordModalOpen = false"
                class="flex-1 py-3 rounded-xl border border-outline/30 text-on-surface hover:bg-white/5 font-bold text-sm transition-all active:scale-95 min-h-[44px]">{{
                  $t('cancel_text') }}</button>
              <button @click="submitPasswordChange" :disabled="isChangingPassword"
                class="flex-1 py-3 rounded-xl font-bold bg-primary text-on-primary shadow-lg hover:shadow-primary/40 disabled:opacity-60 transition-all active:scale-95 text-sm min-h-[44px]">
                <span v-if="isChangingPassword" class="inline-flex items-center gap-2">
                  <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                </span>
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
      <p class="text-on-surface-variant text-sm">{{ $t('settings_login_required') }}</p>
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
