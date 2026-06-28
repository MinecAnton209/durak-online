import { createApp } from 'vue'
import './assets/main.css'
import i18n from './i18n'

import MaintenanceView from './views/MaintenanceView.vue'

const app = createApp(MaintenanceView)

app.use(i18n)

app.mount('#app')
