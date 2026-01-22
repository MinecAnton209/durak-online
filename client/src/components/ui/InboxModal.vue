<template>
    <Teleport to="body">
        <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
            <div class="glass-panel animate-scale-in">
                <header class="inbox-header">
                    <div class="header-left">
                        <button @click="$emit('close')" class="back-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <h1>{{ $t('inbox.title') }}</h1>
                    </div>
                    <div class="header-right">
                        <div class="header-actions">
                            <button v-if="inboxStore.messages.length > 0" @click="inboxStore.markAllAsRead"
                                class="mark-all-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <path d="M18 6 7 17l-5-5" />
                                    <path d="m22 10-7.5 7.5L13 16" />
                                </svg>
                                <span class="text">{{ $t('inbox.mark_all_read') }}</span>
                            </button>
                            <span class="unread-count" v-if="unreadCount > 0">{{ unreadCount }}</span>
                        </div>
                    </div>
                </header>

                <div class="messages-list" v-if="inboxStore.messages.length > 0">
                    <div v-for="msg in inboxStore.messages" :key="msg.id" class="message-card"
                        :class="{ 'unread': !msg.is_read }" @click="toggleMessage(msg)">
                        <div class="card-header">
                            <div class="type-icon" :class="msg.type">
                                <svg v-if="msg.type === 'friend_request'" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" stroke-width="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="8.5" cy="7" r="4" />
                                    <line x1="20" y1="8" x2="20" y2="14" />
                                    <line x1="23" y1="11" x2="17" y2="11" />
                                </svg>
                                <svg v-else-if="msg.type === 'login_alert'" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <h3>{{ $t(msg.title_key || 'inbox.system_message') }}</h3>
                                <span class="timestamp">{{ formatDate(msg.created_at) }}</span>
                            </div>
                        </div>
                        <div class="card-content-wrapper" :class="{ 'expanded': expandedMessages.includes(msg.id) }">
                            <p class="card-content">{{ $t(msg.content_key, msg.content_params) }}</p>
                            <div class="expand-hint" v-if="!expandedMessages.includes(msg.id)">{{
                                $t('inbox.click_to_expand') }}</div>
                        </div>

                        <div class="card-actions" v-if="msg.type === 'friend_request'">
                            <button @click.stop="performAction(msg.id, 'accept')" class="btn-green">{{
                                $t('inbox.btn_accept') }}</button>
                            <button @click.stop="performAction(msg.id, 'decline')" class="btn-red">{{
                                $t('inbox.btn_decline') }}</button>
                        </div>
                        <div class="card-actions" v-else-if="msg.type === 'login_alert'">
                            <div v-if="msg.content_params.action_result" class="action-result">
                                <span class="check-icon">✓</span>
                                {{ $t('inbox.action_result_' + msg.content_params.action_result) }}
                            </div>
                            <template
                                v-else-if="!(inboxStore.currentSessionId && msg.content_params.sessionId === inboxStore.currentSessionId)">
                                <button @click.stop="performAction(msg.id, 'it_was_me')" class="btn-blue">
                                    {{ $t('inbox.btn_it_was_me') }}
                                </button>
                                <button @click.stop="performAction(msg.id, 'not_me')" class="btn-red"
                                    style="margin-left: auto;">
                                    {{ $t('inbox.btn_not_me') }}
                                </button>
                            </template>
                        </div>
                    </div>
                </div>

                <div class="empty-state" v-else-if="!loading">
                    <div class="empty-icon">📥</div>
                    <p>{{ $t('inbox.empty') }}</p>
                </div>

                <div class="loading-state" v-if="loading">
                    <div class="spinner"></div>
                </div>

                <footer class="pagination" v-if="inboxStore.pagination.totalPages > 1">
                    <button :disabled="inboxStore.pagination.page <= 1"
                        @click="inboxStore.fetchMessages(inboxStore.pagination.page - 1)">{{
                            $t('inbox.prev_page') }}</button>
                    <span>{{ $t('inbox.page_info', {
                        current: inboxStore.pagination.page, total:
                            inboxStore.pagination.totalPages
                    }) }}</span>
                    <button :disabled="inboxStore.pagination.page >= inboxStore.pagination.totalPages"
                        @click="inboxStore.fetchMessages(inboxStore.pagination.page + 1)">{{ $t('inbox.next_page')
                        }}</button>
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { useInboxStore } from '@/stores/inbox'
import { useToastStore } from '@/stores/toast'
import { useI18n } from 'vue-i18n'

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
    // If opening, mark as read
    if (!expandedMessages.value.includes(msg.id)) {
        expandedMessages.value.push(msg.id)
        if (!msg.is_read) {
            await inboxStore.markAsRead(msg.id)
        }
    } else {
        // Collapse
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
        expandedMessages.value = [] // Reset expanded state on reopen
    }
})
</script>

<style scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
}

.glass-panel {
    width: 100%;
    max-width: 600px;
    background: #1e1e24;
    /* Solid dark background for better readability, or very dark glass */
    background: rgba(30, 30, 36, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    /* Limit height */
}

.inbox-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.header-right {
    display: flex;
    align-items: center;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.mark-all-btn {
    background: rgba(46, 213, 115, 0.1);
    border: 1px solid rgba(46, 213, 115, 0.3);
    color: #2ed573;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
}

.mark-all-btn:hover {
    background: rgba(46, 213, 115, 0.2);
    border-color: #2ed573;
    transform: translateY(-1px);
}

.mark-all-btn .icon {
    font-weight: bold;
    letter-spacing: -2px;
}

.back-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    width: 40px;
    height: 40px;
    padding: 8px;
    border-radius: 50%;
    transition: all 0.3s ease;
}

.back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
    margin: 0;
}

.unread-count {
    background: #ff4757;
    padding: 0.2rem 0.6rem;
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 700;
    min-width: 20px;
    text-align: center;
}

.messages-list {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    overflow-y: auto;
    flex: 1;
    padding-right: 0.5rem;
    /* Space for scrollbar */
}

/* Scrollbar styling */
.messages-list::-webkit-scrollbar {
    width: 6px;
}

.messages-list::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
}

.messages-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.message-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
}

.message-card:hover {
    background: rgba(255, 255, 255, 0.08);
}

.message-card.unread {
    background: rgba(0, 210, 255, 0.08);
    border-color: rgba(0, 210, 255, 0.3);
}

.card-header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 0.5rem;
}

.type-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.type-icon svg {
    width: 18px;
    height: 18px;
}

.type-icon.friend_request {
    background: rgba(46, 213, 115, 0.2);
    color: #2ed573;
}

.type-icon.login_alert {
    background: rgba(255, 71, 87, 0.2);
    color: #ff4757;
}

.type-icon.system {
    background: rgba(55, 66, 250, 0.2);
    color: #3742fa;
}

.card-title-group {
    flex: 1;
    display: flex;
    flex-direction: column;
}

h3 {
    font-size: 1rem;
    margin: 0;
    color: #fff;
    font-weight: 600;
}

.timestamp {
    font-size: 0.7rem;
    color: #888;
}

.card-content-wrapper {
    position: relative;
    cursor: pointer;
}

.card-content {
    color: #bbb;
    margin: 0 0 0.8rem 0;
    font-size: 0.9rem;
    line-height: 1.4;
    word-break: break-word;

    /* Truncate logic */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    /* Show only 2 lines initially */
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: all 0.3s ease;
}

.card-content-wrapper.expanded .card-content {
    -webkit-line-clamp: unset;
    line-clamp: unset;
    overflow: visible;
}

.expand-hint {
    font-size: 0.7rem;
    color: #888;
    margin-top: -0.5rem;
    margin-bottom: 0.8rem;
    text-align: right;
    font-style: italic;
    opacity: 0.7;
}

.card-content-wrapper.expanded .expand-hint {
    display: none;
}

.card-actions {
    display: flex;
    gap: 0.5rem;
}

button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: none;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
}

.action-result {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #2ed573;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0.5rem 0;
}

.check-icon {
    font-size: 1.1rem;
}

.btn-green {
    background: #2ed573;
    color: #fff;
}

.btn-green:hover {
    background: #26af5f;
}

.btn-red {
    background: #ff4757;
    color: #fff;
}

.btn-red:hover {
    background: #e04050;
}

.btn-blue {
    background: #3742fa;
    color: #fff;
}

.btn-blue:hover {
    background: #2f36d9;
}

.empty-state {
    text-align: center;
    padding: 3rem 0;
    color: #888;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.empty-icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
}

.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.pagination button {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 0.4rem 0.8rem;
    font-size: 0.8rem;
}

.pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.spinner {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 2rem auto;
}

.animate-scale-in {
    animation: scaleIn 0.2s ease-out;
}

@keyframes scaleIn {
    from {
        opacity: 0;
        transform: scale(0.95);
    }

    to {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
