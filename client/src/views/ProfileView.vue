<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ProfileModal from '@/components/ui/ProfileModal.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const profileOpen = ref(true);
const userId = ref(null);

function parseUserId() {
    const id = parseInt(route.params.id);
    userId.value = isNaN(id) ? null : id;
}

function handleClose() {
    router.push('/');
}

onMounted(parseUserId);
watch(() => route.params.id, parseUserId);
</script>

<template>
    <ProfileModal
        :is-open="profileOpen"
        :user-id="userId"
        @close="handleClose"
    />
</template>