import { defineStore } from 'pinia';
import { ref } from 'vue';
import WebApp from '@twa-dev/sdk';
import { useToastStore } from './toast';
import i18n from '@/i18n';
import { getDeviceId } from '@/utils/deviceId';

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
      const deviceId = await getDeviceId();
      const response = await fetch(`/check-session?deviceId=${deviceId}`, {
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
    const deviceId = await getDeviceId();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password, deviceId }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        user.value = data.user;
        isAuthenticated.value = true;
      }
      return data;
    } else {
      const data = await response.json();
      const options = { ...(data.options || {}) };
      if (options.reason === null) {
        options.reason = i18n.global.t('ban_reason_not_specified');
      }
      const errorMsg = data.i18nKey
        ? i18n.global.t(data.i18nKey, options)
        : (data.message || i18n.global.t('error_generic'));
      throw new Error(errorMsg);
    }
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

  async function changePassword({ currentPassword, newPassword }) {
    try {
      const token = getTokenFromCookies()
      const response = await fetch('/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ currentPassword, newPassword })
      })

      const data = await response.json()

      if (response.ok) {
        toast.addToast(i18n.global.t('password_change_success'), 'success')
        return true
      } else {
        const msgKey = data?.i18nKey
        const message = msgKey ? i18n.global.t(msgKey, data?.options || {}) : (data?.message || i18n.global.t('error_generic'))
        toast.addToast(message, 'error')
        return false
      }
    } catch (e) {
      console.error(e)
      toast.addToast(i18n.global.t('connection_error'), 'error')
      return false
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
      const deviceId = await getDeviceId();
      const response = await fetch('/api/telegram/widget-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ ...tgUserData, deviceId })
      });

      const data = await response.json();

      if (response.ok && data.user) {
        user.value = data.user;
        isAuthenticated.value = true;
        return true;
      } else {
        const options = { ...(data.options || {}) };
        if (options.reason === null) {
          options.reason = i18n.global.t('ban_reason_not_specified');
        }
        const errorMsg = data.i18nKey
          ? i18n.global.t(data.i18nKey, options)
          : (data.message || i18n.global.t('error_generic'));
        throw new Error(errorMsg);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
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
    changePassword,
    updateSettings,
    loginWithTelegramWidget,
    unlinkTelegram,
  };
});
