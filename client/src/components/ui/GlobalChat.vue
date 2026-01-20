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

const activeMessageMenu = ref(null);

const menuItemClass = "flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-lg text-xs font-semibold transition-colors text-white w-full text-left";

onMounted(() => {
  if (!socketStore.isConnected) {
    socketStore.connect().then(setupAndJoin);
  } else {
    setupAndJoin();
  }
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (!socketStore.socket) return;
  socketStore.emit('chat:leaveGlobal');
  socketStore.socket.off('chat:history');
  socketStore.socket.off('chat:historyPage');
  socketStore.socket.off('chat:newMessage');
  socketStore.socket.off('chat:updateMessage');
  socketStore.socket.off('chat:error');
  document.removeEventListener('click', handleClickOutside);
});

function handleClickOutside(e) {
  if (activeMessageMenu.value && !e.target.closest('.message-group')) {
    activeMessageMenu.value = null;
  }
}

function setupAndJoin() {
  setupListeners();
  socketStore.emit('chat:joinGlobal');
}

const cooldownRemaining = ref(0);
let cooldownInterval = null;

function startCooldown(seconds) {
  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownRemaining.value = seconds;
  cooldownInterval = setInterval(() => {
    cooldownRemaining.value--;
    if (cooldownRemaining.value <= 0) {
      clearInterval(cooldownInterval);
      cooldownRemaining.value = 0;
    }
  }, 1000);
}

function setupListeners() {
  const socket = socketStore.socket;
  if (!socket) return;

  // Clear existing to prevent duplicates
  socket.off('chat:history');
  socket.off('chat:historyPage');
  socket.off('chat:newMessage');
  socket.off('chat:updateMessage');
  socket.off('chat:error');

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
    // Duplication check
    if (messages.value.some(m => m.id === msg.id)) return;

    const isAtBottom = chatBody.value ?
      (chatBody.value.scrollHeight - chatBody.value.clientHeight <= chatBody.value.scrollTop + 20) :
      true;
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
    if (error.i18nKey === 'error_chat_spam_wait' && error.options?.seconds) {
      startCooldown(error.options.seconds);
    }
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
  if (cooldownRemaining.value > 0) return;
  if (newMessage.value.trim()) {
    socketStore.emit('chat:sendGlobal', newMessage.value);
    newMessage.value = '';
    startCooldown(3); // Base 3s cooldown
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

const adminMute = (userId, duration = null) => {
  if (duration === 'permanent') {
    socketStore.emit('chat:muteUser', { userId, permanent: true });
  } else if (duration === 'custom') {
    const mins = prompt(t('prompt_minutes'));
    if (mins && !isNaN(parseInt(mins))) {
      socketStore.emit('chat:muteUser', { userId, durationMinutes: parseInt(mins) });
    }
  } else {
    socketStore.emit('chat:muteUser', { userId, durationMinutes: duration });
  }
};

const adminBan = (userId, duration = null) => {
  if (duration === 'permanent') {
    socketStore.emit('chat:banUser', { userId, permanent: true });
  } else if (duration === 'custom') {
    const mins = prompt(t('prompt_minutes'));
    if (mins && !isNaN(parseInt(mins))) {
      socketStore.emit('chat:banUser', { userId, durationMinutes: parseInt(mins) });
    }
  } else {
    socketStore.emit('chat:banUser', { userId, durationMinutes: duration });
  }
};

const formatMuteDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString();
};

const formatTime = (ts) => {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isSameAuthorAsPrevious = (index) => {
  if (index === 0) return false;
  return messages.value[index].author.id === messages.value[index - 1].author.id;
};

const isSameAuthorAsNext = (index) => {
  if (index === messages.value.length - 1) return false;
  return messages.value[index].author.id === messages.value[index + 1].author.id;
};

const toggleMessageMenu = (msgId) => {
  if (activeMessageMenu.value === msgId) {
    activeMessageMenu.value = null;
  } else {
    activeMessageMenu.value = msgId;
  }
};

const getBubbleClass = (msg, index) => {
  const isMine = msg.author.id === authStore.user?.id;
  const samePrev = isSameAuthorAsPrevious(index);
  const sameNext = isSameAuthorAsNext(index);

  let classes = isMine
    ? 'bg-primary text-on-primary '
    : 'bg-surface-variant text-on-surface border border-white/5 ';

  if (isMine) {
    // Mine (Right side)
    classes += 'rounded-l-2xl ';
    // Top-right
    if (samePrev) classes += 'rounded-tr-none ';
    else classes += 'rounded-tr-2xl ';
    // Bottom-right
    if (sameNext) classes += 'rounded-br-none ';
    else classes += 'rounded-br-none '; // The "tail" is always sharp
  } else {
    // Others (Left side)
    classes += 'rounded-r-2xl ';
    // Top-left
    if (samePrev) classes += 'rounded-tl-none ';
    else classes += 'rounded-tl-2xl ';
    // Bottom-left
    if (sameNext) classes += 'rounded-bl-none ';
    else classes += 'rounded-bl-none ';
  }

  return classes;
};
</script>

<template>
  <div class="flex flex-col h-full bg-surface/80 border border-white/5 rounded-2xl shadow-lg overflow-hidden relative">

    <div
      class="p-4 border-b border-white/5 bg-surface/90 backdrop-blur-md flex items-center justify-between shrink-0 z-30">
      <div class="flex items-center gap-2">
        <span class="text-xl">🌍</span>
        <h3 class="font-bold text-white tracking-wide">{{ $t('global_chat_title') }}</h3>
      </div>
      <div v-if="isLoadingMore" class="animate-pulse text-[10px] text-primary uppercase font-bold tracking-tighter">
        {{ $t('loading_more') }}
      </div>
    </div>

    <div ref="chatBody" @scroll="handleScroll"
      class="flex-1 p-3 md:p-4 overflow-y-auto scroll-smooth flex flex-col gap-0.5 z-10 custom-scrollbar">

      <div v-for="(msg, index) in messages" :key="msg.id"
        class="flex flex-col w-full group/msg animate-fade-in message-group" :class="[
          msg.author.id === authStore.user?.id ? 'items-end' : 'items-start',
          isSameAuthorAsPrevious(index) ? 'mt-0.5' : 'mt-4 first:mt-0'
        ]">

        <div class="flex max-w-[92%] md:max-w-[80%] gap-2"
          :class="msg.author.id === authStore.user?.id ? 'flex-row-reverse' : 'flex-row'">

          <div v-if="msg.author.id !== authStore.user?.id" class="w-8 shrink-0 flex flex-col justify-end">
            <div v-if="!isSameAuthorAsNext(index)"
              class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0 text-[10px] border border-primary/20 mb-1">
              {{ msg.author.username[0] }}
            </div>
          </div>

          <div class="flex flex-col" :class="msg.author.id === authStore.user?.id ? 'items-end' : 'items-start'">
            <div v-if="msg.author.id !== authStore.user?.id && !isSameAuthorAsPrevious(index)"
              class="flex items-center gap-1.5 ml-1 mb-1">
              <span class="text-[11px] font-black text-primary/80 uppercase tracking-widest">
                {{ msg.author.username }}
              </span>
            </div>

            <div class="relative flex items-center gap-1 group/bubble"
              :class="msg.author.id === authStore.user?.id ? 'flex-row' : 'flex-row-reverse'">

              <button v-if="!msg.deleted" @click.stop="toggleMessageMenu(msg.id)"
                class="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0 active:scale-90"
                :class="{ 'opacity-100 text-primary bg-white/10': activeMessageMenu === msg.id }">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" />
                </svg>
              </button>

              <div class="relative">
                <div :class="[getBubbleClass(msg, index), msg.deleted ? 'opacity-30 italic' : '']"
                  class="px-4 py-2.5 shadow-xl transition-all min-w-[70px] relative overflow-hidden active:scale-[0.98]">

                  <!-- Dynamic background overlay -->
                  <div v-if="msg.author.id === authStore.user?.id" class="absolute inset-0 bg-primary/20 -z-10"></div>
                  <div v-else class="absolute inset-0 bg-white/5 -z-10"></div>

                  <div v-if="editingMessageId === msg.id" class="min-w-[150px] md:min-w-[200px] space-y-2 py-1">
                    <input v-model="editingText" @keyup.esc="cancelEditing" @keyup.enter="submitEdit" type="text"
                      class="w-full bg-black/20 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/50 text-white">
                    <div class="flex justify-end gap-3 px-1">
                      <button @click="cancelEditing"
                        class="text-[10px] uppercase font-bold opacity-60 hover:opacity-100 text-white">{{
                          $t('cancel_button')
                        }}</button>
                      <button @click="submitEdit"
                        class="text-[10px] uppercase font-bold text-white hover:text-primary">{{ $t('save_button')
                        }}</button>
                    </div>
                  </div>

                  <template v-else>
                    <p class="text-[14.5px] leading-relaxed break-words text-white font-medium pr-1">
                      {{ msg.text }}
                    </p>

                    <div class="flex items-center justify-end gap-1.5 mt-1 select-none">
                      <span v-if="msg.edited" class="text-[8px] uppercase font-black text-white/30 italic">{{
                        $t('edited_tag') }}</span>
                      <span class="text-[10px] font-bold font-mono text-white/80 tracking-tighter">{{
                        formatTime(msg.timestamp) }}</span>
                    </div>
                  </template>
                </div>

                <div v-if="activeMessageMenu === msg.id"
                  class="absolute z-[100] top-[calc(100%+8px)] bg-[#1a1a1a]/95 border border-white/10 rounded-xl shadow-2xl py-2 px-1 flex flex-col min-w-[190px] backdrop-blur-3xl animate-pop-in"
                  :class="msg.author.id === authStore.user?.id ? 'right-0' : 'left-0'">

                  <template v-if="authStore.user?.is_admin">
                    <button @click="adminMute(msg.author.id, 60); activeMessageMenu = null" :class="menuItemClass">
                      <span class="text-base">⏳</span> <span>{{ $t('admin_mute_1h') }}</span>
                    </button>
                    <button @click="adminBan(msg.author.id, 'permanent'); activeMessageMenu = null"
                      :class="[menuItemClass, 'text-red-400']">
                      <span class="text-base">🚫</span> <span>{{ $t('admin_ban_permanent') }}</span>
                    </button>
                    <div class="h-px bg-white/10 my-1 mx-2"></div>
                  </template>

                  <template v-if="msg.author.id === authStore.user?.id">
                    <button @click="startEditing(msg); activeMessageMenu = null" :class="menuItemClass">
                      <span class="text-base text-primary">✏️</span> <span>{{ $t('edit_message') }}</span>
                    </button>
                    <button @click="openDeleteConfirm(msg, false); activeMessageMenu = null"
                      :class="[menuItemClass, 'text-red-400']">
                      <span class="text-base">🗑️</span> <span>{{ $t('delete_message') }}</span>
                    </button>
                  </template>

                  <button @click="activeMessageMenu = null" :class="menuItemClass" class="opacity-60 text-sm">
                    <span>✖</span> <span>{{ $t('cancel_button') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 bg-primary/5 border-t border-primary/10 shrink-0 backdrop-blur-xl z-30">
      <div v-if="authStore.isAuthenticated" class="flex flex-col gap-2">
        <div class="relative flex items-center">
          <input v-model="newMessage" @keyup.enter="sendMessage" type="text" :placeholder="$t('chat_placeholder')"
            :disabled="cooldownRemaining > 0"
            class="w-full bg-black/40 border border-primary/20 rounded-2xl px-5 py-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all pr-14 disabled:opacity-50">

          <button @click="sendMessage" :disabled="cooldownRemaining > 0 || !newMessage.trim()"
            class="absolute right-2 w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center active:scale-90 transition-all shadow-lg shadow-primary/20">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" />
            </svg>
          </button>
        </div>

        <div class="flex justify-between items-center px-1">
          <span class="text-[9px] text-white/20 uppercase font-black tracking-[0.2em] select-none italic">{{
            $t('global_chat_title') }}</span>
          <div class="flex items-center gap-2">
            <span v-if="cooldownRemaining > 0" class="text-[10px] text-primary font-bold animate-pulse">
              {{ $t('chat_cooldown_wait', { seconds: cooldownRemaining }) }}
            </span>
            <span v-else class="text-[10px] text-white/10 font-bold uppercase tracking-tighter italic select-none">
              {{ $t('chat_cooldown_limit', { seconds: 3 }) }}
            </span>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-2">
        <p class="text-[11px] text-white/30 font-medium italic">
          {{ $t('chat_login_prompt') }}
        </p>
      </div>
    </div>

    <!-- Global Modal Overlays -->
    <ConfirmModal :is-open="isConfirmModalOpen" :title="$t('delete_confirm_title')"
      :message="$t('delete_confirm_message')" :confirm-text="$t('delete_button')" :cancel-text="$t('cancel_button')"
      @confirm="confirmDelete" @cancel="closeConfirmModal" />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}

.animate-pop-in {
  animation: popIn 0.2s cubic-bezier(0.2, 1, 0.3, 1);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
}

/* Красивые хвосты сообщений */
.rounded-br-none {
  border-bottom-right-radius: 4px !important;
}

.rounded-bl-none {
  border-bottom-left-radius: 4px !important;
}
</style>