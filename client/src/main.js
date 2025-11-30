import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/main.css'
import i18n from './i18n'
import WebApp from '@twa-dev/sdk'

import App from './App.vue'
import router from './router'

import { useAuthStore } from './stores/auth';

const pinia = createPinia();

window.onTelegramAuth = async (user) => {
  console.log("Telegram Auth Data (Widget):", user);

  const authStore = useAuthStore(pinia);
  const success = await authStore.loginWithTelegramWidget(user);

  if (success) {
    window.location.reload();
  } else {
    alert('Error logging in via Telegram. Please try again.');
  }
};

WebApp.ready();
WebApp.expand();

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(i18n);

app.mount('#app');
