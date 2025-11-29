import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const isAuthenticated = ref(false);
  const isAuthChecking = ref(true);

  async function checkSession() {
    isAuthChecking.value = true;
    try {
      const response = await fetch('/check-session');
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
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.i18nKey ? data.i18nKey : (data.message || 'Помилка сервера');
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
      await fetch('/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      user.value = null;
      isAuthenticated.value = false;
    }
  }

  async function updateSettings(settings) {
    try {
      const response = await fetch('/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok && user.value) {
        user.value = { ...user.value, ...settings };
      }
    } catch (e) {
      console.error(e);
    }
  }

  return {
    user,
    isAuthenticated,
    isAuthChecking,
    checkSession,
    authenticate,
    logout,
    updateSettings
  };
});
