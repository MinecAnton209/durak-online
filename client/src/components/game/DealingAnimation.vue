<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import Card from './Card.vue';

const props = defineProps({
  trumpCard: Object,
});

const emit = defineEmits(['finished']);

const flyingCards = ref([]);
const showTrump = ref(false);
const trumpStyle = ref({});

// Timed-sequence fallback: guarantees the deal resolves even if 'finished'
// is missed (e.g. component unmount/tab switch) so the game never gets stuck.
let finished = false;
let safetyTimer = null;

const finish = () => {
  if (finished) return;
  finished = true;
  if (safetyTimer) clearTimeout(safetyTimer);
  emit('finished');
};

onMounted(() => {
  startSequence();
  safetyTimer = setTimeout(finish, 6000);
});

onUnmounted(() => {
  if (safetyTimer) clearTimeout(safetyTimer);
});

const startSequence = async () => {
  await animateTrump();

  for (let i = 0; i < 6; i++) {
    spawnCard('me', i);
    await delay(90);
    spawnCard('opponent', i);
    await delay(90);
  }

  await delay(700);
  finish();
};

const animateTrump = async () => {
  showTrump.value = true;
  trumpStyle.value = {
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(0deg) scale(1)',
    zIndex: 50
  };

  await delay(120);

  trumpStyle.value = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) scale(1.25)',
    zIndex: 50,
    transition: 'all 0.6s ease-out'
  };

  await delay(750);

  trumpStyle.value = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(90deg) scale(1)',
    zIndex: 0,
    transition: 'all 0.5s ease-in'
  };

  await delay(450);
};

const spawnCard = (target, index) => {
  const id = `deal-${target}-${index}`;
  const isMe = target === 'me';

  const card = {
    id,
    style: {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)',
      opacity: 0,
      transition: 'all 0.55s cubic-bezier(0.25, 1, 0.5, 1)'
    }
  };

  flyingCards.value = flyingCards.value.filter(c => c.id !== id);
  flyingCards.value.push(card);

  requestAnimationFrame(() => {
    card.style.opacity = 1;
    if (isMe) {
      card.style.top = '100%';
      card.style.left = '50%';
      card.style.transform = `translate(-50%, -100%) rotate(${index * 4 - 10}deg) scale(1)`;
    } else {
      card.style.top = '0%';
      card.style.left = '50%';
      card.style.transform = `translate(-50%, 0%) rotate(${180 + index * 4 - 10}deg) scale(0.8)`;
    }
  });

  setTimeout(() => {
    flyingCards.value = flyingCards.value.filter(c => c.id !== id);
  }, 650);
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));
</script>

<template>
  <div class="fixed inset-0 z-[100] pointer-events-none overflow-hidden">

    <div
      v-if="showTrump"
      class="absolute w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-36 transition-all"
      :style="trumpStyle"
    >
      <Card :rank="trumpCard.rank" :suit="trumpCard.suit" />
    </div>

    <div
      v-for="card in flyingCards"
      :key="card.id"
      class="absolute w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-36"
      :style="card.style"
    >
      <Card :is-back="true" />
    </div>

    <div class="absolute top-[50%] left-[50%] w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-36 -translate-x-1/2 -translate-y-1/2">
      <Card :is-back="true" class="shadow-2xl" />
      <div class="absolute top-1 left-1 w-full h-full bg-gray-700 rounded-xl -z-10 border border-gray-600"></div>
      <div class="absolute top-2 left-2 w-full h-full bg-gray-700 rounded-xl -z-20 border border-gray-600"></div>
    </div>

  </div>
</template>
