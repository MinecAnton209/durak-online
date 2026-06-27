<template>
  <BaseModal :is-open="isOpen" max-width="max-w-lg" @close="emit('close')">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-white">{{ $t('inbox.title') }}</h2>
      <div class="flex items-center gap-2">
        <button
          v-if="inboxStore.messages.length > 0"
          @click="inboxStore.markAllAsRead"
          class="bg-primary/10 border border-primary/30 text-primary rounded-lg text-xs font-bold flex items-center gap-2 px-3 py-2 min-h-[36px] hover:bg-primary/20 hover:border-primary transition-all active:scale-95 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-7.5 7.5L13 16" />
          </svg>
          {{ $t('inbox.mark_all_read') }}
        </button>
        <span
          v-if="unreadCount > 0"
          class="bg-error text-white px-2 py-0.5 rounded-full text-xs font-bold min-w-[20px] text-center"
        >{{ unreadCount }}</span>
      </div>
    </div>

    <!-- Messages list -->
    <div v-if="inboxStore.messages.length > 0" class="space-y-2 max-h-[60dvh] overflow-y-auto pr-1">
      <div
        v-for="msg in inboxStore.messages"
        :key="msg.id"
        class="bg-white/5 border border-white/5 rounded-xl p-3 cursor-pointer transition-all hover:bg-white/8"
        :class="!msg.is_read ? 'border-primary/30 bg-primary/5' : ''"
        @click="toggleMessage(msg)"
      >
        <!-- Card header -->
        <div class="flex items-center gap-3 mb-2">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            :class="{
              'bg-primary/20 text-primary': msg.type === 'friend_request',
              'bg-error/20 text-error': msg.type === 'login_alert',
              'bg-blue-500/20 text-blue-500': msg.type === 'system'
            }"
          >
            <svg v-if="msg.type === 'friend_request'" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <svg v-else-if="msg.type === 'login_alert'" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div class="flex-1 flex flex-col">
            <h3 class="text-sm font-semibold text-white m-0">{{ $t(msg.title_key || 'inbox.system_message') }}</h3>
            <span class="text-xs text-on-surface-variant">{{ formatDate(msg.created_at) }}</span>
          </div>
        </div>

        <!-- Card content -->
        <div
          class="cursor-pointer"
          :class="expandedMessages.includes(msg.id) ? '' : 'line-clamp-2'"
        >
          <p class="text-on-surface-variant text-sm leading-relaxed m-0 mb-2 break-words">{{ $t(msg.content_key, msg.content_params) }}</p>
          <div v-if="!expandedMessages.includes(msg.id)" class="text-xs text-on-surface-variant italic opacity-70 text-right -mt-1 mb-2">
            {{ $t('inbox.click_to_expand') }}
          </div>
        </div>

        <!-- Friend request actions -->
        <div v-if="msg.type === 'friend_request'" class="flex gap-2">
          <button
            @click.stop="performAction(msg.id, 'accept')"
            class="bg-primary text-on-primary rounded-lg text-xs font-bold px-3 py-2 min-h-[36px] hover:brightness-90 transition-all active:scale-95 cursor-pointer"
          >{{ $t('inbox.btn_accept') }}</button>
          <button
            @click.stop="performAction(msg.id, 'decline')"
            class="bg-error text-white rounded-lg text-xs font-bold px-3 py-2 min-h-[36px] hover:brightness-90 transition-all active:scale-95 cursor-pointer"
          >{{ $t('inbox.btn_decline') }}</button>
        </div>

        <!-- Login alert actions -->
        <div v-else-if="msg.type === 'login_alert'" class="flex gap-2">
          <div v-if="msg.content_params.action_result" class="flex items-center gap-2 text-primary font-semibold text-sm py-2">
            <span class="text-base">✓</span>
            {{ $t('inbox.action_result_' + msg.content_params.action_result) }}
          </div>
          <template v-else-if="!(inboxStore.currentSessionId && msg.content_params.sessionId === inboxStore.currentSessionId)">
            <button
              @click.stop="performAction(msg.id, 'it_was_me')"
              class="bg-blue-500 text-white rounded-lg text-xs font-bold px-3 py-2 min-h-[36px] hover:brightness-90 transition-all active:scale-95 cursor-pointer"
            >{{ $t('inbox.btn_it_was_me') }}</button>
            <button
              @click.stop="performAction(msg.id, 'not_me')"
              class="bg-error text-white rounded-lg text-xs font-bold px-3 py-2 min-h-[36px] hover:brightness-90 transition-all active:scale-95 cursor-pointer ml-auto"
            >{{ $t('inbox.btn_not_me') }}</button>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading" class="flex flex-col items-center justify-center py-12 text-on-surface-variant">
      <div class="text-4xl mb-2">📥</div>
      <p>{{ $t('inbox.empty') }}</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="w-8 h-8 border-3 border-white/10 border-t-white rounded-full animate-spin"></div>
    </div>

    <!-- Pagination -->
    <footer v-if="inboxStore.pagination.totalPages > 1" class="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-white/10">
      <button
        :disabled="inboxStore.pagination.page <= 1"
        @click="inboxStore.fetchMessages(inboxStore.pagination.page - 1)"
        class="bg-white/10 text-white rounded-lg text-xs font-bold px-3 py-2 min-h-[36px] hover:bg-white/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >{{ $t('inbox.prev_page') }}</button>
      <span class="text-sm text-on-surface-variant">{{ $t('inbox.page_info', { current: inboxStore.pagination.page, total: inboxStore.pagination.totalPages }) }}</span>
      <button
        :disabled="inboxStore.pagination.page >= inboxStore.pagination.totalPages"
        @click="inboxStore.fetchMessages(inboxStore.pagination.page + 1)"
        class="bg-white/10 text-white rounded-lg text-xs font-bold px-3 py-2 min-h-[36px] hover:bg-white/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >{{ $t('inbox.next_page') }}</button>
    </footer>
  </BaseModal>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { useInboxStore } from '@/stores/inbox'
import { useToastStore } from '@/stores/toast'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/ui/BaseModal.vue'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])
const { t } = useI18n()
const toastStore = useToastStore()

const inboxStore = useInboxStore()
const expandedMessages = ref([])

const unreadCount = computed(() => inboxStore.unreadCount)

const toggleMessage = async (msg) => {
  if (!expandedMessages.value.includes(msg.id)) {
    expandedMessages.value.push(msg.id)
    if (!msg.is_read) {
      await inboxStore.markAsRead(msg.id)
    }
  } else {
    expandedMessages.value = expandedMessages.value.filter(id => id !== msg.id)
  }
}

const performAction = async (id, action) => {
  try {
    await axios.post(`/api/inbox/${id}/action`, { action })
    await inboxStore.fetchMessages(inboxStore.pagination.page)
  } catch (err) {
    console.error('Failed to perform action:', err)
    const errorData = err.response?.data
    const message = errorData?.i18nKey ? t(errorData.i18nKey) : (errorData?.error || t('error_generic'))
    toastStore.addToast(message, 'error')
  }
}

const formatDate = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleString()
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    inboxStore.fetchMessages()
    expandedMessages.value = []
  }
})
</script>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 6px; }
.scrollbar-thin::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
</style>
