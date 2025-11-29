<script setup>
import { useFriendsStore } from '@/stores/friends';
const friendsStore = useFriendsStore();
</script>

<template>
  <transition name="pop">
    <div v-if="friendsStore.currentInvite"
         class="fixed top-4 right-4 z-[9999] w-80 bg-surface border border-primary rounded-2xl shadow-2xl p-4 animate-slide-in">

      <div class="flex items-start gap-4">
        <div class="text-3xl">💌</div>
        <div class="flex-1">
          <h4 class="text-primary font-bold text-lg mb-1">Запрошення!</h4>
          <p class="text-on-surface text-sm mb-4">
            Гравець <span class="font-bold text-white">{{ friendsStore.currentInvite.fromUser.username
            }}</span> кличе вас у гру.
          </p>

          <div class="flex gap-2">
            <button @click="friendsStore.acceptInvite"
                    class="flex-1 bg-primary text-on-primary py-2 rounded-lg text-sm font-bold hover:brightness-110 transition-all">Прийняти</button>
            <button @click="friendsStore.declineInvite"
                    class="flex-1 bg-white/10 text-white py-2 rounded-lg text-sm hover:bg-white/20 transition-all">Відхилити</button>
          </div>
        </div>
      </div>

    </div>
  </transition>
</template>

<style scoped>
.animate-slide-in {
  animation: slideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
