<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useSocketStore } from '@/stores/socket';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useI18n } from 'vue-i18n';

import ConfirmModal from '@/components/ui/ConfirmModal.vue';

const socketStore = useSocketStore();
const authStore = useAuthStore();
const toast = useToastStore();
const { t } = useI18n();

const messages = ref([]);
const newMessage = ref('');
const chatBody = ref(null);
const hasMore = ref(false);
const isLoadingMore = ref(false);

const isConfirmModalOpen = ref(false);
const messageToDelete = ref(null);
const isAdminDelete = ref(false);

const editingMessageId = ref(null);
const editingText = ref('');

onMounted(() => {
  if (!socketStore.isConnected) {
    socketStore.connect().then(setupAndJoin);
  } else {
    setupAndJoin();
  }
});

onUnmounted(() => {
  if (!socketStore.socket) return;
  socketStore.emit('chat:leaveGlobal');
  socketStore.socket.off('chat:history');
  socketStore.socket.off('chat:historyPage');
  socketStore.socket.off('chat:newMessage');
  socketStore.socket.off('chat:updateMessage');
  socketStore.socket.off('chat:error');
});

function setupAndJoin() {
  setupListeners();
  socketStore.emit('chat:joinGlobal');
}

function setupListeners() {
  const socket = socketStore.socket;
  if (!socket) return;

  socket.on('chat:history', (data) => {
    messages.value = data.messages;
    hasMore.value = data.hasMore;
    scrollToBottom('auto');
  });

  socket.on('chat:historyPage', (data) => {
    const oldScrollHeight = chatBody.value.scrollHeight;
    messages.value.unshift(...data.messages);
    hasMore.value = data.hasMore;
    nextTick(() => {
      if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight - oldScrollHeight;
    });
    isLoadingMore.value = false;
  });

  socket.on('chat:newMessage', (msg) => {
    const isAtBottom = chatBody.value.scrollHeight - chatBody.value.clientHeight <= chatBody.value.scrollTop + 20;
    messages.value.push(msg);
    if (isAtBottom) scrollToBottom();
  });

  socket.on('chat:updateMessage', (updatedMsg) => {
    const index = messages.value.findIndex(m => m.id === updatedMsg.id);
    if (index > -1) messages.value[index] = updatedMsg;
  });

  socket.on('chat:error', (error) => {
    const message = t(error.i18nKey, error.options || {});
    toast.addToast(message, 'warning');
  });
}

const scrollToBottom = (behavior = 'smooth') => {
  nextTick(() => {
    if (chatBody.value) chatBody.value.scrollTo({ top: chatBody.value.scrollHeight, behavior });
  });
};

const handleScroll = () => {
  if (isLoadingMore.value || !hasMore.value) return;
  if (chatBody.value && chatBody.value.scrollTop < 20) {
    loadMoreMessages();
  }
};

const loadMoreMessages = () => {
  if (isLoadingMore.value || !hasMore.value) return;
  isLoadingMore.value = true;
  const firstMessage = messages.value[0];
  if (firstMessage) socketStore.emit('chat:loadMore', { beforeTimestamp: firstMessage.timestamp });
};

const sendMessage = () => {
  if (newMessage.value.trim()) {
    socketStore.emit('chat:sendGlobal', newMessage.value);
    newMessage.value = '';
  }
};

function openDeleteConfirm(message, isAdminAction = false) {
  messageToDelete.value = message.id;
  isAdminDelete.value = isAdminAction;
  isConfirmModalOpen.value = true;
}
function confirmDelete() {
  if (messageToDelete.value) {
    const event = isAdminDelete.value ? 'chat:deleteMessage' : 'chat:deleteOwnMessage';
    socketStore.emit(event, { messageId: messageToDelete.value });
  }
  closeConfirmModal();
}
function closeConfirmModal() {
  isConfirmModalOpen.value = false;
  messageToDelete.value = null;
  isAdminDelete.value = false;
}

function startEditing(message) {
  editingMessageId.value = message.id;
  editingText.value = message.text;
}
function cancelEditing() {
  editingMessageId.value = null;
  editingText.value = '';
}
function submitEdit() {
  if (editingText.value.trim() && editingMessageId.value) {
    socketStore.emit('chat:editMessage', {
      messageId: editingMessageId.value,
      newText: editingText.value
    });
  }
  cancelEditing();
}
</script>

<template>
  <div class="flex flex-col h-full bg-surface/80 border border-white/5 rounded-2xl shadow-lg">
    <div class="p-3 border-b border-white/5 font-bold text-white text-center">
      🌍 {{ $t('global_chat_title') }}
    </div>

    <div ref="chatBody" @scroll="handleScroll" class="flex-1 p-3 space-y-3 overflow-y-auto">

      <div v-if="hasMore" class="text-center">
        <button @click="loadMoreMessages" :disabled="isLoadingMore" class="text-primary text-xs hover:underline disabled:text-on-surface-variant disabled:no-underline">
          <span v-if="isLoadingMore">{{ $t('loading_more') }}...</span>
          <span v-else>{{ $t('load_more') }}</span>
        </button>
      </div>

      <div v-for="msg in messages" :key="msg.id" class="flex items-start gap-2 text-sm group animate-fade-in">
        <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0 text-xs">
          {{ msg.author.username[0] }}
        </div>

        <div class="flex-1 flex flex-col">
          <div class="flex items-center gap-1.5">
            <span class="font-bold" :class="{ 'text-yellow-400': msg.author.isAdmin, 'text-primary': !msg.author.isAdmin }">
                {{ msg.author.username }}
            </span>
            <svg v-if="msg.author.isVerified" class="w-3 h-3 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>

          <div v-if="editingMessageId === msg.id" class="flex gap-1 mt-1">
            <input v-model="editingText" @keyup.esc="cancelEditing" @keyup.enter="submitEdit" type="text"
                   class="flex-1 bg-black/50 border border-primary rounded px-2 py-1 text-on-surface text-sm focus:outline-none">
            <button @click="submitEdit" class="text-xs text-primary font-bold">{{ $t('save_button') }}</button>
            <button @click="cancelEditing" class="text-xs text-gray-400">{{ $t('cancel_button') }}</button>
          </div>

          <p v-else class="text-on-surface break-words" :class="{ 'italic text-gray-500': msg.deleted }">
            {{ msg.text }}
            <span v-if="msg.edited" class="text-xs text-gray-500 ml-1">{{ $t('edited_tag') }}</span>
          </p>
        </div>

        <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button v-if="msg.author.id === authStore.user?.id && !msg.deleted" @click="startEditing(msg)" class="text-gray-400 hover:text-white" :title="$t('edit_message')">✏️</button>
          <button v-if="authStore.user?.is_admin && !msg.deleted" @click="openDeleteConfirm(msg, true)" class="text-gray-400 hover:text-error" :title="$t('delete_message_admin')">🗑️</button>
          <button v-else-if="msg.author.id === authStore.user?.id && !msg.deleted" @click="openDeleteConfirm(msg, false)" class="text-gray-400 hover:text-error" :title="$t('delete_message')">🗑️</button>
        </div>
      </div>
    </div>

    <div v-if="authStore.isAuthenticated" class="p-3 border-t border-white/5">
      <div class="flex gap-2">
        <input v-model="newMessage" @keyup.enter="sendMessage" type="text" :placeholder="$t('chat_placeholder')"
               class="flex-1 bg-black/30 border border-outline/50 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary transition-all">
        <button @click="sendMessage" class="bg-primary text-on-primary font-bold px-4 rounded-lg active:scale-95 transition-transform">
          ➤
        </button>
      </div>
    </div>
    <div v-else class="p-3 border-t border-white/5 text-center text-xs text-on-surface-variant">
      {{ $t('chat_login_prompt') }}
    </div>
  </div>

  <ConfirmModal
    :is-open="isConfirmModalOpen"
    :title="$t('delete_confirm_title')"
    :message="$t('delete_confirm_message')"
    :confirm-text="$t('delete_button')"
    :cancel-text="$t('cancel_button')"
    @confirm="confirmDelete"
    @cancel="closeConfirmModal"
  />
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
