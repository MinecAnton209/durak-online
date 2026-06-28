<script setup>
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
    isOpen: Boolean,
    userId: { type: Number, default: null }
});
const emit = defineEmits(['close']);

const { t } = useI18n();
const authStore = useAuthStore();

const profile = ref(null);
const loading = ref(true);
const editing = ref(false);
const saving = ref(false);
const error = ref(null);

const editNickname = ref('');
const editBio = ref('');
const editAvatarId = ref('default');

const isOwner = computed(() => {
    return authStore.user && profile.value && authStore.user.id === profile.value.user.id;
});

const avatarUrl = (id) => `/avatars/${id || 'default'}.svg`;

const VALID_AVATARS = ['default','bear','cat','dog','fox','owl','penguin','rabbit','tiger','wolf','dragon','snake'];

async function fetchProfile() {
    if (!props.userId) return;
    loading.value = true;
    error.value = null;
    try {
        const res = await fetch(`/api/profile/${props.userId}`);
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        profile.value = data;
        editNickname.value = data.user.username;
        editBio.value = data.profile.bio || '';
        editAvatarId.value = data.profile.avatar_id || 'default';
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}

function startEditing() {
    editing.value = true;
    editNickname.value = profile.value.user.username;
    editBio.value = profile.value.profile.bio || '';
    editAvatarId.value = profile.value.profile.avatar_id || 'default';
}

function cancelEditing() {
    editing.value = false;
}

async function saveProfile() {
    saving.value = true;
    error.value = null;
    try {
        const body = {};
        if (editNickname.value !== profile.value.user.username) body.nickname = editNickname.value;
        if (editBio.value !== (profile.value.profile.bio || '')) body.bio = editBio.value;
        if (editAvatarId.value !== (profile.value.profile.avatar_id || 'default')) body.avatarId = editAvatarId.value;

        const res = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!res.ok) {
            error.value = data.error || 'Failed to save';
            return;
        }

        profile.value = data;
        editing.value = false;
        if (authStore.user && data.user.id === authStore.user.id) {
            authStore.user.username = data.user.username;
        }
    } catch (e) {
        error.value = e.message;
    } finally {
        saving.value = false;
    }
}

watch(() => props.isOpen, (open) => {
    if (open && props.userId) fetchProfile();
});

watch(() => props.userId, () => {
    if (props.isOpen && props.userId) fetchProfile();
});
</script>

<template>
    <BaseModal :is-open="isOpen" :title="t('profile_title')" max-width="max-w-md" @close="emit('close')">
        <div v-if="loading" class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-10 w-10 border-[3px] border-primary border-t-transparent"></div>
        </div>

        <div v-else-if="error && !profile" class="text-center py-12 text-on-surface-variant">
            <span class="text-4xl block mb-3">😢</span>
            {{ error }}
        </div>

        <div v-else-if="profile" class="space-y-6">
            <!-- Avatar -->
            <div class="flex flex-col items-center gap-4">
                <div class="relative">
                    <img
                        :src="avatarUrl(editing ? editAvatarId : profile.profile.avatar_id)"
                        :alt="profile.user.username"
                        class="w-28 h-28 rounded-full border-2 border-white/10 shadow-xl transition-transform duration-200 hover:scale-105"
                    />
                    <div v-if="profile.user.is_verified"
                        class="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                        <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                    </div>
                </div>

                <!-- Avatar Picker (edit mode) -->
                <div v-if="editing" class="grid grid-cols-4 gap-3 w-full max-w-xs">
                    <button
                        v-for="avatar in VALID_AVATARS"
                        :key="avatar"
                        @click="editAvatarId = avatar"
                        class="p-1 rounded-xl transition-all duration-200"
                        :class="editAvatarId === avatar ? 'ring-2 ring-primary bg-primary/10 scale-105' : 'hover:bg-white/5'"
                    >
                        <img :src="avatarUrl(avatar)" :alt="avatar" class="w-14 h-14 rounded-full" />
                    </button>
                </div>
            </div>

            <!-- Nickname -->
            <div class="text-center">
                <div v-if="!editing" class="flex items-center justify-center gap-2">
                    <span class="text-3xl font-bold text-white tracking-tight">{{ profile.user.username }}</span>
                </div>
                <div v-else>
                    <input
                        v-model="editNickname"
                        maxlength="20"
                        class="w-full text-center text-2xl font-bold bg-white/5 rounded-xl px-4 py-3 text-white border border-white/10 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                        :placeholder="t('profile_nickname')"
                    />
                </div>
            </div>

            <!-- Bio -->
            <div class="text-center">
                <div v-if="!editing" class="text-sm text-on-surface-variant/70 leading-relaxed max-w-xs mx-auto line-clamp-3">
                    {{ profile.profile.bio || t('profile_no_bio') }}
                </div>
                <textarea
                    v-else
                    v-model="editBio"
                    maxlength="200"
                    :placeholder="t('profile_bio_placeholder')"
                    rows="3"
                    class="w-full bg-white/5 rounded-xl px-4 py-3 text-white text-sm border border-white/10 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all resize-none"
                ></textarea>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-4 gap-2">
                <div class="bg-white/5 rounded-2xl p-3 border border-white/10 text-center animate-stagger-in">
                    <div class="text-2xl font-bold text-primary mb-0.5">{{ profile.user.wins }}</div>
                    <div class="flex items-center justify-center gap-1 text-[11px] uppercase tracking-widest text-primary/60 font-semibold">
                        <span>🏆</span>
                        <span>{{ t('profile_wins') }}</span>
                    </div>
                </div>
                <div class="bg-white/5 rounded-2xl p-3 border border-white/10 text-center animate-stagger-in stagger-delay-1">
                    <div class="text-2xl font-bold text-red-400 mb-0.5">{{ profile.user.losses }}</div>
                    <div class="flex items-center justify-center gap-1 text-[11px] uppercase tracking-widest text-red-400/60 font-semibold">
                        <span>📉</span>
                        <span>{{ t('profile_losses') }}</span>
                    </div>
                </div>
                <div class="bg-white/5 rounded-2xl p-3 border border-white/10 text-center animate-stagger-in stagger-delay-2">
                    <div class="text-2xl font-bold text-yellow-400 mb-0.5">{{ Math.round(profile.user.rating) }}</div>
                    <div class="flex items-center justify-center gap-1 text-[11px] uppercase tracking-widest text-yellow-400/60 font-semibold">
                        <span>⭐</span>
                        <span>{{ t('profile_rating') }}</span>
                    </div>
                </div>
                <div class="bg-white/5 rounded-2xl p-3 border border-white/10 text-center animate-stagger-in stagger-delay-3">
                    <div class="text-2xl font-bold text-green-400 mb-0.5">{{ profile.user.win_streak }}</div>
                    <div class="flex items-center justify-center gap-1 text-[11px] uppercase tracking-widest text-green-400/60 font-semibold">
                        <span>🔥</span>
                        <span>{{ t('profile_streak') }}</span>
                    </div>
                </div>
            </div>

            <!-- Member Since -->
            <div class="flex items-center justify-center gap-1.5 text-xs text-on-surface-variant/50">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {{ t('profile_member_since') }} {{ new Date(profile.user.created_at).toLocaleDateString() }}
            </div>

            <!-- Error -->
            <div v-if="error" class="text-center text-red-400 text-sm bg-red-500/10 rounded-xl py-2">{{ error }}</div>

            <!-- Actions -->
            <div class="flex gap-2 pt-1">
                <template v-if="isOwner && !editing">
                    <button @click="startEditing" class="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold hover:brightness-110 hover:-translate-y-0.5 transition-all active:translate-y-0 active:scale-[0.98] shadow-lg shadow-primary/20">
                        ✏️ {{ t('profile_edit') }}
                    </button>
                </template>
                <template v-if="editing">
                    <button @click="cancelEditing" class="flex-1 py-2.5 rounded-xl bg-white/5 text-white font-medium hover:bg-white/10 transition-all active:scale-[0.98]">
                        {{ t('profile_cancel') }}
                    </button>
                    <button @click="saveProfile" :disabled="saving" class="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold hover:brightness-110 hover:-translate-y-0.5 transition-all active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-lg shadow-primary/20">
                        <span v-if="saving" class="inline-flex items-center gap-2">
                            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            {{ t('profile_save') }}
                        </span>
                        <span v-else>{{ t('profile_save') }}</span>
                    </button>
                </template>
            </div>
        </div>
    </BaseModal>
</template>

<style scoped>
.animate-stagger-in {
    animation: staggerFadeIn 0.4s ease-out both;
}

.stagger-delay-1 {
    animation-delay: 0.05s;
}

.stagger-delay-2 {
    animation-delay: 0.1s;
}

.stagger-delay-3 {
    animation-delay: 0.15s;
}

@keyframes staggerFadeIn {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
