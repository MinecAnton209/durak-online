import { defineStore } from 'pinia';
import { ref } from 'vue';
import WebApp from '@twa-dev/sdk';

export const useTelegramStore = defineStore('telegram', () => {
  const isTelegram = ref(false);
  const user = ref(null);
  const themeParams = ref({});

  function init() {
    if (WebApp.platform !== 'unknown') {
      isTelegram.value = true;
      user.value = WebApp.initDataUnsafe?.user;
      themeParams.value = WebApp.themeParams;

      if (themeParams.value.bg_color) {
        document.body.style.backgroundColor = themeParams.value.bg_color;
      }

      console.log('Telegram init:', user.value);
    }
  }

  return { isTelegram, user, themeParams, init };
});
