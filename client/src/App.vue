<script setup>
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';
import { useGameStore } from '@/stores/game';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useNotificationStore } from '@/stores/notifications';
import GameInviteModal from '@/components/game/GameInviteModal.vue';
import { useFriendsStore } from '@/stores/friends';

const authStore = useAuthStore();
const socketStore = useSocketStore();
const gameStore = useGameStore();
const notifStore = useNotificationStore();
const friendsStore = useFriendsStore();

onMounted(() => {
  authStore.checkSession();

  socketStore.connect();

  gameStore.initListeners();

  notifStore.init();

  friendsStore.initListeners();
});
</script>

<template>
  <RouterView />
  <ToastContainer />
  <GameInviteModal />
</template>