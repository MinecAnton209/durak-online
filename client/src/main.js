import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/main.css'
import i18n from './i18n'
import WebApp from '@twa-dev/sdk'

import App from './App.vue'
import router from './router'

import { useAuthStore } from './stores/auth';
import axios from 'axios';

axios.defaults.withCredentials = true;

const pinia = createPinia();

window.onTelegramAuth = async (user) => {
  console.log("Telegram Auth Data (Widget):", user);

  const authStore = useAuthStore(pinia);
  try {
    await authStore.loginWithTelegramWidget(user);
    window.location.reload();
  } catch (e) {
    alert(e.message || 'Error logging in via Telegram. Please try again.');
  }
};

WebApp.ready();
WebApp.expand();

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(i18n);

app.mount('#app');
