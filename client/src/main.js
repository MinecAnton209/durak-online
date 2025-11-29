import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/main.css'
import i18n from './i18n'
import WebApp from '@twa-dev/sdk'

import App from './App.vue'
import router from './router'

WebApp.ready();
WebApp.expand();

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
