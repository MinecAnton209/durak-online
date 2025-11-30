import { defineStore } from 'pinia';
import { ref } from 'vue';
import WebApp from '@twa-dev/sdk';
import { useToastStore } from './toast';
import i18n from '@/i18n';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const isAuthenticated = ref(false);
  const isAuthChecking = ref(true);
  const toast = useToastStore();

  function getTokenFromCookies() {
    const match = document.cookie.match(/(?:^|; )durak_token=([^;]+)/)
    return match ? decodeURIComponent(match[1]) : null
  }

  async function checkSession() {
    isAuthChecking.value = true;
    try {
      const token = getTokenFromCookies()
      const response = await fetch('/check-session', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        if (data.isLoggedIn && data.user) {
          user.value = data.user;
          isAuthenticated.value = true;
        }
      }
    } catch (e) {
      console.error('Ошибка проверки сессии:', e);
    } finally {
      isAuthChecking.value = false;
    }
  }

  async function authenticate(mode, { username, password }) {
    const endpoint = mode === 'login' ? '/login' : '/register';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      const data = await response.json();

      if (response.status === 403 && data.i18nKey === 'error_account_banned_with_reason') {
      }

      const errorMsg = data.i18nKey ? data.i18nKey : (data.message || i18n.global.t('error_generic'));
      throw new Error(errorMsg);
    }

    if (data.user) {
      user.value = data.user;
      isAuthenticated.value = true;
    }
    return data;
  }

  async function logout() {
    try {
      const token = getTokenFromCookies()
      await fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      user.value = null;
      isAuthenticated.value = false;
    }
  }

  async function updateSettings(settings) {
    try {
      const token = getTokenFromCookies()
      const response = await fetch('/update-settings', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(settings),
      });

      if (response.ok && user.value) {
        user.value = { ...user.value, ...settings };
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loginWithTelegramWidget(tgUserData) {
    try {
      const token = getTokenFromCookies()
      const response = await fetch('/api/telegram/widget-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(tgUserData)
      });

      const data = await response.json();

      if (response.ok && data.user) {
        user.value = data.user;
        isAuthenticated.value = true;
        return true;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
    return false;
  }

  async function unlinkTelegram() {
    try {
      const token = getTokenFromCookies()
      const res = await fetch('/api/telegram/unlink', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ initData: WebApp?.initData || null })
      });
      const data = await res.json();

      if (res.ok) {
        user.value = data.user;
        toast.addToast(i18n.global.t('telegram_unlinked'), 'info');
      } else {
        const msg = res.status === 401 ? i18n.global.t('error_unauthorized') : (data.message || i18n.global.t('error_generic'));
        toast.addToast(msg, 'error');
      }
    } catch { toast.addToast(i18n.global.t('connection_error'), 'error'); }
  }

  return {
    user,
    isAuthenticated,
    isAuthChecking,
    checkSession,
    authenticate,
    logout,
    updateSettings,
    loginWithTelegramWidget,
    unlinkTelegram,
  };
});
