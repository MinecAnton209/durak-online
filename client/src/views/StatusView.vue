<template>
  <div v-if="authStore.isAuthenticated" class="status-page safe-p">
    <div class="container">
      <header>
        <h1>🎮 {{ $t('status_page_title') }}</h1>
        <p class="subtitle">{{ $t('status_page_subtitle') }}</p>
        <div v-if="healthData" class="status-badge" :class="{ error: healthData.status !== 'OK' }">
          <span class="status-dot"></span>
          {{ healthData.status === 'OK' ? $t('status_server_running') : $t('status_server_issues') }}
        </div>
      </header>

      <div v-if="loading && !healthData" class="loading">
        <div class="spinner"></div>
        <p>{{ $t('status_loading') }}</p>
      </div>

      <div v-else-if="error" class="error-card">
        <h2>❌ {{ $t('status_error_title') }}</h2>
        <p>{{ error }}</p>
        <button class="refresh-btn" @click="reconnectSocket">
          🔄 {{ $t('status_try_again') }}
        </button>
      </div>

      <div v-else-if="healthData" class="grid">
        <!-- App Info -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon">⚙️</div>
            <h2 class="card-title">{{ $t('status_card_app_info') }}</h2>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_version') }}</span>
            <span class="stat-value">{{ healthData.app.version }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_environment') }}</span>
            <span class="stat-value">{{ healthData.app.environment }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_uptime') }}</span>
            <span class="stat-value success">{{ healthData.app.uptime }}</span>
          </div>
        </div>

        <!-- Online Activity -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon">👥</div>
            <h2 class="card-title">{{ $t('status_card_activity') }}</h2>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_users_online') }}</span>
            <span class="stat-value highlight">{{ healthData.activity.users_online }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_sessions_total') }}</span>
            <span class="stat-value">{{ healthData.activity.sessions_total }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_players_in_game') }}</span>
            <span class="stat-value">{{ healthData.activity.players_in_game }}</span>
          </div>
        </div>

        <!-- Games -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon">🎯</div>
            <h2 class="card-title">{{ $t('status_card_games') }}</h2>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_games_in_progress') }}</span>
            <span class="stat-value highlight">{{ healthData.activity.games_in_progress }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_lobbies_waiting') }}</span>
            <span class="stat-value">{{ healthData.activity.lobbies_waiting }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_public_lobbies') }}</span>
            <span class="stat-value">{{ healthData.activity.public_lobbies }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_private_lobbies') }}</span>
            <span class="stat-value">{{ healthData.activity.private_lobbies }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_bot_games') }}</span>
            <span class="stat-value">{{ healthData.activity.bot_games_active }}</span>
          </div>
        </div>

        <!-- Daily Stats -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon">📊</div>
            <h2 class="card-title">{{ $t('status_card_daily') }}</h2>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_date') }}</span>
            <span class="stat-value">{{ formatDate(healthData.daily_stats.date) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_registrations_today') }}</span>
            <span class="stat-value highlight">{{ healthData.daily_stats.registrations_today }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_games_played_today') }}</span>
            <span class="stat-value highlight">{{ healthData.daily_stats.games_played_today }}</span>
          </div>
        </div>

        <!-- System -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon">💻</div>
            <h2 class="card-title">{{ $t('status_card_system') }}</h2>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_memory') }}</span>
            <span class="stat-value">{{ healthData.system.memory_rss }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_node_version') }}</span>
            <span class="stat-value">{{ healthData.system.node_version }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_db_ping') }}</span>
            <span class="stat-value" :class="{ success: healthData.system.db_ping_ms < 50 }">
              {{ healthData.system.db_ping_ms }} мс
            </span>
          </div>
        </div>

        <!-- Timestamp -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon">🕐</div>
            <h2 class="card-title">{{ $t('status_card_timestamp') }}</h2>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('status_server_time') }}</span>
            <span class="stat-value">{{ formatDateTime(healthData.timestamp) }}</span>
          </div>
          <div v-if="lastUpdate" class="stat-item">
            <span class="stat-label">{{ $t('status_last_update') }}</span>
            <span class="stat-value">{{ lastUpdate }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="min-h-screen flex items-center justify-center p-4 bg-background">
    <div
      class="w-full max-w-md bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 p-6 md:p-8 text-center">
      <h2 class="text-2xl font-bold text-white mb-2">{{ $t('status_label') }}</h2>
      <p class="text-on-surface-variant">{{ $t('settings_login_required') }}</p>
      <button @click="router.push('/')"
        class="w-full mt-4 py-4 rounded-xl border border-outline/30 text-on-surface hover:bg-white/5 transition-colors font-bold">
        {{ $t('go_home') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSocketStore } from '@/stores/socket'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const authStore = useAuthStore()
const socketStore = useSocketStore()
const { t } = useI18n()

const healthData = ref(null)
const loading = ref(false)
const error = ref(null)
const lastUpdate = ref('')

const setupSocketListeners = () => {
  const socket = socketStore.socket
  if (!socket) return

  socket.off('health:update')

  socket.on('health:update', (stats) => {
    healthData.value = stats
    const locale = localStorage.getItem('language') || 'uk'
    lastUpdate.value = new Date().toLocaleTimeString(locale === 'uk' ? 'uk-UA' : locale === 'ru' ? 'ru-RU' : 'en-US')
    loading.value = false
    error.value = null
  })

  socket.emit('health:subscribe')
  console.log('✅ Subscribed to health updates')
}

const cleanupSocketListeners = () => {
  const socket = socketStore.socket
  if (!socket) return

  socket.off('health:update')
  socket.emit('health:unsubscribe')
  console.log('❌ Unsubscribed from health updates')
}

const reconnectSocket = async () => {
  loading.value = true
  error.value = null

  try {
    await socketStore.connect()
    setupSocketListeners()
  } catch (err) {
    error.value = t('connection_error')
    loading.value = false
  }
}

const formatDate = (dateString) => {
  const locale = localStorage.getItem('language') || 'uk'
  return new Date(dateString).toLocaleDateString(locale === 'uk' ? 'uk-UA' : locale === 'ru' ? 'ru-RU' : 'en-US')
}

const formatDateTime = (dateString) => {
  const locale = localStorage.getItem('language') || 'uk'
  return new Date(dateString).toLocaleString(locale === 'uk' ? 'uk-UA' : locale === 'ru' ? 'ru-RU' : 'en-US')
}

onMounted(async () => {
  if (!authStore.isAuthenticated && !authStore.isAuthChecking) {
    router.push('/')
    return
  }

  if (authStore.isAuthenticated) {
    loading.value = true

    try {
      await socketStore.connect()
      setupSocketListeners()
    } catch (err) {
      error.value = t('connection_error')
      loading.value = false
    }
  }
})

onUnmounted(() => {
  cleanupSocketListeners()
})

watch(() => authStore.isAuthenticated, (val) => {
  if (!val && !authStore.isAuthChecking) {
    router.push('/')
  } else if (val) {
    reconnectSocket()
  }
})
</script>

<style scoped>
.status-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%);
  padding: 2rem;
  position: relative;
  overflow-x: hidden;
}

.status-page::before {
  content: '';
  position: fixed;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%);
  animation: rotate 30s linear infinite;
  pointer-events: none;
  z-index: 0;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

header {
  text-align: center;
  margin-bottom: 3rem;
  animation: fadeInDown 0.6s ease-out;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

h1 {
  font-size: 3rem;
  font-weight: 700;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
  filter: drop-shadow(0 0 40px rgba(99, 102, 241, 0.3));
}

.subtitle {
  color: #94a3b8;
  font-size: 1.1rem;
  font-weight: 400;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid #10b981;
  border-radius: 50px;
  color: #10b981;
  font-weight: 600;
  margin-top: 1rem;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
  animation: pulse 2s ease-in-out infinite;
}

.status-badge.error {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.8;
  }
}

.status-dot {
  width: 10px;
  height: 10px;
  background: #10b981;
  border-radius: 50%;
  animation: blink 1.5s ease-in-out infinite;
}

.status-badge.error .status-dot {
  background: #ef4444;
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.card {
  background: rgba(30, 35, 50, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(100, 116, 139, 0.2);
  border-radius: 16px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease-out backwards;
}

.card:hover {
  background: rgba(40, 45, 65, 0.8);
  border-color: #6366f1;
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(99, 102, 241, 0.2);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card:nth-child(1) {
  animation-delay: 0.1s;
}

.card:nth-child(2) {
  animation-delay: 0.2s;
}

.card:nth-child(3) {
  animation-delay: 0.3s;
}

.card:nth-child(4) {
  animation-delay: 0.4s;
}

.card:nth-child(5) {
  animation-delay: 0.5s;
}

.card:nth-child(6) {
  animation-delay: 0.6s;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.card-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 10px;
  font-size: 1.25rem;
}

.card-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #f1f5f9;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  color: #94a3b8;
  font-size: 0.9rem;
}

.stat-value {
  color: #f1f5f9;
  font-weight: 600;
  font-size: 1rem;
}

.stat-value.highlight {
  color: #6366f1;
  font-size: 1.5rem;
}

.stat-value.success {
  color: #10b981;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #94a3b8;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(100, 116, 139, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-card {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #ef4444;
  border-radius: 12px;
  padding: 1.5rem;
  color: #ef4444;
  text-align: center;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 1rem;
}

.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(99, 102, 241, 0.3);
}

.refresh-btn:active {
  transform: translateY(0);
}

.last-update {
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
  margin-top: 2rem;
}

@media (max-width: 768px) {
  .status-page {
    padding: 1rem;
  }

  h1 {
    font-size: 2rem;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}

/* Tailwind-like utilities for unauthenticated state */
.min-h-screen {
  min-height: 100vh;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-center {
  justify-content: center;
}

.p-4 {
  padding: 1rem;
}

.bg-background {
  background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%);
}

.w-full {
  width: 100%;
}

.max-w-md {
  max-width: 28rem;
}

.bg-surface\/95 {
  background: rgba(30, 35, 50, 0.95);
}

.backdrop-blur-sm {
  backdrop-filter: blur(8px);
}

.rounded-3xl {
  border-radius: 1.5rem;
}

.shadow-2xl {
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.border {
  border-width: 1px;
}

.border-white\/5 {
  border-color: rgba(255, 255, 255, 0.05);
}

.p-6 {
  padding: 1.5rem;
}

.md\:p-8 {
  padding: 2rem;
}

.text-center {
  text-align: center;
}

.text-2xl {
  font-size: 1.5rem;
}

.font-bold {
  font-weight: 700;
}

.text-white {
  color: white;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.text-on-surface-variant {
  color: #94a3b8;
}

.mt-4 {
  margin-top: 1rem;
}

.py-4 {
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.rounded-xl {
  border-radius: 0.75rem;
}

.border-outline\/30 {
  border-color: rgba(100, 116, 139, 0.3);
}

.text-on-surface {
  color: #f1f5f9;
}

.hover\:bg-white\/5:hover {
  background: rgba(255, 255, 255, 0.05);
}

.transition-colors {
  transition: color 0.3s, background-color 0.3s, border-color 0.3s;
}
</style>
