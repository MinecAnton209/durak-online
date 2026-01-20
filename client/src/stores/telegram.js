import { defineStore } from 'pinia';
import { ref } from 'vue';
import WebApp from '@twa-dev/sdk';
import { useToastStore } from './toast';
import { useAuthStore } from './auth';
import i18n from '@/i18n';
import { getDeviceId } from "@/utils/deviceId.js";

export const useTelegramStore = defineStore('telegram', () => {
  const toast = useToastStore();
  const authStore = useAuthStore();

  const isTelegram = ref(false);
  const user = ref(null);
  const themeParams = ref({});

  function init() {
    if (WebApp.initData) {
      isTelegram.value = true;
      user.value = WebApp.initDataUnsafe?.user;

      themeParams.value = WebApp.themeParams;
      if (themeParams.value.bg_color) {
        document.documentElement.style.setProperty('--color-background', themeParams.value.bg_color);
      }

      tryAutoLogin();
    }
  }

  async function tryAutoLogin() {
    if (!isTelegram.value || authStore.isAuthenticated) return;
    authStore.isAuthChecking = true;
    try {
      const devId = await getDeviceId();
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ initData: WebApp.initData, deviceId: devId })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        authStore.user = data.user;
        authStore.isAuthenticated = true;
        toast.addToast(i18n.global.t('hello_username', { username: data.user.username }), 'success');
      } else {
        const errorMsg = data.i18nKey
          ? i18n.global.t(data.i18nKey, data.options || {})
          : (data.message || i18n.global.t('error_generic'));
        toast.addToast(errorMsg, 'error');
      }
    } catch (e) {
      console.error("Telegram auto-login failed:", e);
      toast.addToast(i18n.global.t('connection_error'), 'error');
    } finally {
      authStore.isAuthChecking = false;
    }
  }

  async function linkAccount() {
    if (!isTelegram.value) {
      toast.addToast(i18n.global.t('open_in_telegram'), 'error');
      return false;
    }

    const initDataRaw = WebApp.initData;
    if (!initDataRaw) {
      toast.addToast(i18n.global.t('telegram_data_unavailable'), 'error');
      return false;
    }

    try {
      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          initData: initDataRaw
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        try {
          const errorJson = JSON.parse(errorText);
          toast.addToast(errorJson.message || i18n.global.t('error_generic'), 'error');
        } catch {
          toast.addToast(i18n.global.t('error_generic'), 'error');
        }
        return false;
      }

      const data = await res.json();

      if (data.user) {
        authStore.user = data.user;
      }

      toast.addToast(i18n.global.t('telegram_linked_title'), 'success');
      return true;

    } catch (e) {
      console.error(e);
      toast.addToast(i18n.global.t('connection_error'), 'error');
      return false;
    }
  }

  async function unlinkAccount() {
    if (!isTelegram.value) {
      toast.addToast(i18n.global.t('open_in_telegram'), 'error');
      return false;
    }

    try {
      const res = await fetch('/api/telegram/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) {
        const errorText = await res.text();
        try {
          const errorJson = JSON.parse(errorText);
          toast.addToast(errorJson.message || i18n.global.t('error_generic'), 'error');
        } catch {
          toast.addToast(i18n.global.t('error_generic'), 'error');
        }
        return false;
      }

      const data = await res.json();

      if (data.user) {
        authStore.user = data.user;
      }

      toast.addToast(i18n.global.t('telegram_unlinked'), 'success');
      return true;

    } catch (e) {
      console.error(e);
      toast.addToast(i18n.global.t('connection_error'), 'error');
      return false;
    }
  }


  return {
    isTelegram,
    user,
    themeParams,
    init,
    linkAccount,
    unlinkAccount,
    tryAutoLogin
  };
});
