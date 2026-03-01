import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import GameView from '../views/GameView.vue'
import SettingsView from '../views/SettingsView.vue'
import TermsView from '../views/TermsView.vue'
import RouletteView from '../views/RouletteView.vue'
import ErrorView from '../views/ErrorView.vue'
import MaintenanceView from '../views/MaintenanceView.vue'
import LobbyBrowser from "@/views/LobbyBrowser.vue";
import StatusView from '../views/StatusView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/lobbies',
      name: 'lobbies',
      component: LobbyBrowser
    },
    {
      path: '/game/:id',
      name: 'game',
      component: GameView
    },
    {
      path: '/lobby/:id',
      component: GameView
    },
    {
      path: '/terms',
      name: 'terms',
      component: TermsView
    },
    {
      path: '/game/:id',
      name: 'game',
      component: GameView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    },
    {
      path: '/roulette',
      name: 'roulette',
      component: RouletteView
    },
    {
      path: '/status',
      name: 'status',
      component: StatusView
    },
    {
      path: '/maintenance',
      name: 'maintenance',
      component: MaintenanceView
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAdmin: true }
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('../views/MatchHistoryView.vue')
    },
    {
      path: '/analysis/:id',
      name: 'analysis',
      component: () => import('../views/MatchAnalysisView.vue')
    },
    {
      path: '/:catchAll(.*)',
      name: 'not-found',
      component: ErrorView
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  if (authStore.isAuthChecking) {
    await authStore.checkSession()
  }

  if (to.meta.requiresAdmin) {
    if (!authStore.isAuthenticated || !authStore.user?.is_admin) {
      next('/')
      return
    }
  }

  next()
})

export default router
