<script setup>
import { defineProps, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useI18n } from 'vue-i18n';
import { parseUserAgent } from '@/utils/userAgentParser';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps({
    isOpen: Boolean
});

const emit = defineEmits(['close']);
const authStore = useAuthStore();
const toast = useToastStore();
const { t, d } = useI18n();

const sessions = ref([]);
const isLoading = ref(true);
const expandedSessions = ref({}); // Track expanded state by ID

const fetchSessions = async () => {
    isLoading.value = true;
    try {
        const res = await fetch('/api/auth/sessions'); // Fallback check
        // Actual route is /sessions based on previous context
        const res2 = await fetch('/sessions');
        if (res2.ok) {
            const rawSessions = await res2.json();
            sessions.value = rawSessions.map(s => {
                const ua = parseUserAgent(s.device);
                return {
                    ...s,
                    parsedOs: ua.os,
                    parsedBrowser: ua.browser
                };
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        isLoading.value = false;
    }
};

const toggleDetails = (id) => {
    expandedSessions.value[id] = !expandedSessions.value[id];
};

const terminateSession = async (sessionId) => {
    if (!confirm(t('session_confirm_terminate'))) return;

    try {
        const res = await fetch(`/sessions/${sessionId}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            toast.addToast(t('session_terminated_success'), 'success');
            sessions.value = sessions.value.filter(s => s.id !== sessionId);
        } else {
            const msg = data.i18nKey ? t(data.i18nKey) : (data.message || t('error_generic'));
            toast.addToast(msg, 'error');
        }
    } catch (e) {
        toast.addToast(t('connection_error'), 'error');
    }
};

onMounted(() => {
    if (props.isOpen) fetchSessions();
});
import { watch } from 'vue';
watch(() => props.isOpen, (val) => {
    if (val) fetchSessions();
});
</script>

<template>
    <BaseModal :is-open="isOpen" :title="$t('sessions_modal_title')" max-width="max-w-lg" @close="emit('close')">
        <div class="space-y-4">
            <div v-if="isLoading" class="flex justify-center py-8">
                <span class="animate-spin text-primary text-2xl">⏳</span>
            </div>

            <div v-else-if="sessions.length === 0" class="text-center text-on-surface-variant py-4">
                {{ $t('no_data') }}
            </div>

            <div v-else v-for="session in sessions" :key="session.id"
                class="bg-black/20 rounded-xl p-4 border border-white/5 flex flex-col gap-2 relative overflow-hidden transition-all">

                <div v-if="session.is_current"
                    class="absolute top-0 right-0 bg-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded-bl-xl uppercase tracking-wider">
                    {{ $t('session_current') }}
                </div>

                <div class="flex items-start justify-between cursor-pointer" @click="toggleDetails(session.id)">
                    <div class="flex items-center gap-3">
                        <div class="bg-white/10 p-2 rounded-lg text-2xl">
                            <span
                                v-if="session.device.toLowerCase().includes('mobile') || session.device.toLowerCase().includes('android') || session.device.toLowerCase().includes('iphone')">📱</span>
                            <span v-else>💻</span>
                        </div>
                        <div>
                            <p class="font-bold text-white text-sm line-clamp-1" :title="session.device">
                                {{ session.parsedOs }} • {{ session.parsedBrowser }}
                            </p>
                            <p class="text-xs text-on-surface-variant">{{ session.location }}</p>
                        </div>
                    </div>
                    <div class="text-on-surface-variant transform transition-transform"
                        :class="expandedSessions[session.id] ? 'rotate-180' : ''">
                        ▼
                    </div>
                </div>

                <!-- Dropdown Details -->
                <div v-if="expandedSessions[session.id]"
                    class="mt-2 pt-2 border-t border-white/5 text-xs space-y-1 animate-fade-in bg-black/10 p-2 rounded-lg">
                    <p><strong class="text-on-surface-variant">{{ $t('session_os') }}:</strong> <span
                            class="text-white">{{ session.parsedOs }}</span></p>
                    <p><strong class="text-on-surface-variant">{{ $t('session_browser') }}:</strong> <span
                            class="text-white">{{ session.parsedBrowser }}</span></p>
                    <p><strong class="text-on-surface-variant">{{ $t('session_ip') }}:</strong> <span
                            class="text-white">{{ session.ip }}</span></p>
                    <p><strong class="text-on-surface-variant">{{ $t('session_created_at') }}:</strong> <span
                            class="text-white">{{ d(new Date(session.created_at), 'long') }}</span></p>
                    <p class="break-all text-[10px] text-white/30 mt-1">{{ session.device }}</p>
                </div>

                <div class="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                    <p class="text-[10px] text-on-surface-variant uppercase font-bold">
                        {{ $t('session_last_active') }}: <span class="text-white">{{ d(new
                            Date(session.last_active), 'long') }}</span>
                    </p>

                    <button v-if="!session.is_current" @click.stop="terminateSession(session.id)"
                        class="min-h-[40px] text-error hover:bg-error/10 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        {{ $t('session_terminate') }}
                    </button>
                </div>
            </div>
        </div>
    </BaseModal>
</template>
