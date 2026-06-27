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
        <div v-if="loading" class="flex justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>

        <div v-else-if="error && !profile" class="text-center py-8 text-on-surface-variant">
            {{ error }}
        </div>

        <div v-else-if="profile" class="space-y-5">
            <!-- Avatar -->
            <div class="flex flex-col items-center gap-3">
                <div class="relative group">
                    <img
                        :src="avatarUrl(editing ? editAvatarId : profile.profile.avatar_id)"
                        :alt="profile.user.username"
                        class="w-20 h-20 rounded-full border-2 border-white/20 shadow-lg"
                    />
                </div>

                <!-- Avatar Picker (edit mode) -->
                <div v-if="editing" class="grid grid-cols-4 gap-2 w-full max-w-xs">
                    <button
                        v-for="avatar in VALID_AVATARS"
                        :key="avatar"
                        @click="editAvatarId = avatar"
                        class="p-1 rounded-xl transition-all"
                        :class="editAvatarId === avatar ? 'ring-2 ring-primary bg-primary/20' : 'hover:bg-white/10'"
                    >
                        <img :src="avatarUrl(avatar)" :alt="avatar" class="w-12 h-12 rounded-full" />
                    </button>
                </div>
            </div>

            <!-- Nickname -->
            <div class="text-center">
                <div v-if="!editing" class="text-xl font-bold text-white flex items-center justify-center gap-2">
                    {{ profile.user.username }}
                    <span v-if="profile.user.is_verified" class="text-blue-400 text-sm" title="Verified">✓</span>
                </div>
                <div v-else>
                    <input
                        v-model="editNickname"
                        maxlength="20"
                        class="w-full text-center text-xl font-bold bg-white/10 rounded-xl px-3 py-2 text-white border border-white/20 focus:border-primary focus:outline-none"
                    />
                </div>
            </div>

            <!-- Bio -->
            <div class="text-center">
                <div v-if="!editing" class="text-on-surface-variant text-sm">
                    {{ profile.profile.bio || t('profile_no_bio') }}
                </div>
                <textarea
                    v-else
                    v-model="editBio"
                    maxlength="200"
                    :placeholder="t('profile_bio_placeholder')"
                    rows="3"
                    class="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm border border-white/20 focus:border-primary focus:outline-none resize-none"
                ></textarea>
            </div>

            <!-- Stats Bar -->
            <div class="grid grid-cols-4 gap-2 bg-black/20 rounded-xl p-3">
                <div class="text-center">
                    <div class="text-lg font-bold text-primary">{{ profile.user.wins }}</div>
                    <div class="text-xs text-on-surface-variant">{{ t('profile_wins') }}</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-red-400">{{ profile.user.losses }}</div>
                    <div class="text-xs text-on-surface-variant">{{ t('profile_losses') }}</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-yellow-400">{{ Math.round(profile.user.rating) }}</div>
                    <div class="text-xs text-on-surface-variant">{{ t('profile_rating') }}</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-green-400">{{ profile.user.win_streak }}</div>
                    <div class="text-xs text-on-surface-variant">{{ t('profile_streak') }}</div>
                </div>
            </div>

            <!-- Member Since -->
            <div class="text-center text-xs text-on-surface-variant">
                {{ t('profile_member_since') }} {{ new Date(profile.user.created_at).toLocaleDateString() }}
            </div>

            <!-- Error -->
            <div v-if="error" class="text-center text-red-400 text-sm">{{ error }}</div>

            <!-- Actions -->
            <div class="flex gap-2">
                <template v-if="isOwner && !editing">
                    <button @click="startEditing" class="flex-1 py-2.5 rounded-xl bg-primary text-white font-medium hover:brightness-110 transition-all">
                        {{ t('profile_edit') }}
                    </button>
                </template>
                <template v-if="editing">
                    <button @click="cancelEditing" class="flex-1 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-all">
                        {{ t('profile_cancel') }}
                    </button>
                    <button @click="saveProfile" :disabled="saving" class="flex-1 py-2.5 rounded-xl bg-primary text-white font-medium hover:brightness-110 transition-all disabled:opacity-50">
                        {{ saving ? '...' : t('profile_save') }}
                    </button>
                </template>
            </div>
        </div>
    </BaseModal>
</template>
