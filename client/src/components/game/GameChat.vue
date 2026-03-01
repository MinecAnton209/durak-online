<script setup>
import { ref, watch, nextTick } from 'vue';
import { useGameStore } from '@/stores/game';
import { useI18n } from 'vue-i18n';

const gameStore = useGameStore();
const { t } = useI18n();

const isOpen = ref(false);
const messageInput = ref('');
const logContainer = ref(null);

const isUserAtBottom = ref(true);
const hasNewMessages = ref(false);

const toggleChat = () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    gameStore.markChatRead();
    scrollToBottom(true);
  }
};

const handleSend = () => {
  if (!messageInput.value.trim()) return;
  gameStore.sendMessage(messageInput.value);
  messageInput.value = '';
  scrollToBottom(true);
};

const handleScroll = () => {
  if (!logContainer.value) return;

  const { scrollTop, scrollHeight, clientHeight } = logContainer.value;
  const isBottom = scrollHeight - scrollTop - clientHeight < 50;

  isUserAtBottom.value = isBottom;

  if (isBottom) {
    hasNewMessages.value = false;
  }
};

const scrollToBottom = async (force = false) => {
  await nextTick();
  if (logContainer.value) {
    if (force || isUserAtBottom.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
      hasNewMessages.value = false;
    }
  }
};

watch(() => gameStore.chatLog.length, async () => {
  if (isOpen.value) {
    if (!isUserAtBottom.value) {
      hasNewMessages.value = true;
    } else {
      scrollToBottom();
    }
  }
});

const formatEntry = (entry) => {
  if (entry.i18nKey) {
    return `<span class="text-on-surface-variant italic">${t(entry.i18nKey, entry.options)}</span>`;
  }
  return entry.message;
};
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col items-end pointer-events-none">

    <transition name="slide-fade">
      <div v-if="isOpen"
           class="pointer-events-auto w-80 h-96 bg-surface/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4 relative">
        <div class="bg-black/20 p-3 flex justify-between items-center border-b border-white/5 shrink-0">
          <h3 class="text-white font-bold text-sm">{{ $t('chat_title') }}</h3>
          <button @click="toggleChat" class="text-on-surface-variant hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div ref="logContainer" @scroll="handleScroll"
             class="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scroll-smooth">
          <div v-if="gameStore.chatLog.length === 0" class="text-center text-white/30 text-xs mt-4">
            {{ $t('chat_empty') }}
          </div>

          <div v-for="(entry, index) in gameStore.chatLog" :key="index" class="text-sm break-words animate-message flex items-baseline gap-1.5 py-0.5">
            <span class="text-white/40 text-[10px] shrink-0 font-mono">[{{ entry.timestamp }}]</span>
            <div class="flex-1">
              <template v-if="entry.author">
                <span class="message-author">
                  {{ entry.author.name }}
                  <span v-if="entry.author.isVerified" class="verified-badge" :title="$t('verified_label')">✓</span>:
                </span>
                <span class="message-text text-white/90">{{ entry.message }}</span>
              </template>
              <span v-else v-html="formatEntry(entry)" class="align-middle"></span>
            </div>
          </div>
        </div>

        <transition name="fade">
          <button v-if="!isUserAtBottom" @click="scrollToBottom(true)"
                  class="absolute bottom-16 right-4 bg-primary text-on-primary rounded-full p-2 shadow-lg hover:bg-[#00A891] transition-all z-10 flex items-center gap-2 text-xs font-bold px-3 animate-bounce-small">
            <span v-if="hasNewMessages">{{ $t('chat_new_messages') }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3">
              </path>
            </svg>
          </button>
        </transition>

        <form @submit.prevent="handleSend" class="p-2 border-t border-white/5 bg-black/10 flex gap-2 shrink-0">
          <input v-model="messageInput" type="text"
                 class="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                 :placeholder="$t('chat_placeholder')">
          <button type="submit" class="bg-primary hover:bg-[#00A891] text-on-primary p-2 rounded-lg transition-colors">
            <svg class="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
            </svg>
          </button>
        </form>
      </div>
    </transition>

    <button @click="toggleChat"
            class="pointer-events-auto bg-surface border border-white/10 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all relative group">
      <svg class="w-6 h-6 text-primary group-hover:text-white transition-colors" fill="none" stroke="currentColor"
           viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z">
        </path>
      </svg>

      <div v-if="gameStore.unreadMessages > 0 && !isOpen"
           class="absolute -top-1 -right-1 bg-error text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full animate-bounce">
        {{ gameStore.unreadMessages }}
      </div>
    </button>

  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(20px) scale(0.95);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes fadeInMsg {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-message {
  animation: fadeInMsg 0.3s ease-out;
}

@keyframes bounceSmall {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-3px);
  }
}

.animate-bounce-small {
  animation: bounceSmall 1s infinite;
}

:deep(.message-author) {
  font-weight: 700;
  color: var(--color-primary);
  margin-right: 0.25rem;
}

:deep(.message-text) {
  color: var(--color-on-surface);
}

:deep(.verified-badge) {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-left: 0.25em;
  vertical-align: middle;
  color: #60a5fa;
}
</style>
