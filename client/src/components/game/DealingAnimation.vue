<script setup>
import { onMounted, ref } from 'vue';
import Card from './Card.vue';

const props = defineProps({
  trumpCard: Object,
});

const emit = defineEmits(['finished']);

const flyingCards = ref([]);
const showTrump = ref(false);
const trumpStyle = ref({});

onMounted(() => {
  startSequence();
});

const startSequence = async () => {
  await animateTrump();

  for (let i = 0; i < 6; i++) {
    spawnCard('me', i);
    await delay(100);
    spawnCard('opponent', i);
    await delay(100);
  }

  await delay(800);
  emit('finished');
};

const animateTrump = async () => {
  showTrump.value = true;
  trumpStyle.value = {
    top: '40%',
    left: '10%',
    transform: 'rotate(0deg) scale(1)',
    zIndex: 50
  };

  await delay(100);

  trumpStyle.value = {
    top: '40%',
    left: '25%',
    transform: 'rotate(0deg) scale(1.2)',
    zIndex: 50,
    transition: 'all 0.6s ease-out'
  };

  await delay(800);

  trumpStyle.value = {
    top: '40%',
    left: '14%',
    transform: 'rotate(90deg) scale(1)',
    zIndex: 0,
    transition: 'all 0.5s ease-in'
  };

  await delay(500);
};

const spawnCard = (target, index) => {
  const id = Date.now() + Math.random();
  const isMe = target === 'me';

  const card = {
    id,
    style: {
      top: '40%',
      left: '10%',
      opacity: 0,
      transform: 'scale(0.5) rotate(0deg)',
      transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)'
    }
  };

  flyingCards.value.push(card);

  requestAnimationFrame(() => {
    card.style.opacity = 1;
    if (isMe) {
      card.style.top = '100%';
      card.style.left = '50%';
      card.style.transform = `translate(-50%, -100%) rotate(${index * 5 - 15}deg) scale(1)`;
    } else {
      card.style.top = '0%';
      card.style.left = '50%';
      card.style.transform = `translate(-50%, 0%) rotate(180deg) scale(0.8)`;
    }
  });

  setTimeout(() => {
    flyingCards.value = flyingCards.value.filter(c => c.id !== id);
  }, 700);
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));
</script>

<template>
  <div class="fixed inset-0 z-[100] pointer-events-none overflow-hidden">

    <div
      v-if="showTrump"
      class="absolute w-24 h-36 transition-all"
      :style="trumpStyle"
    >
      <Card :rank="trumpCard.rank" :suit="trumpCard.suit" />
    </div>

    <div
      v-for="card in flyingCards"
      :key="card.id"
      class="absolute w-24 h-36"
      :style="card.style"
    >
      <Card :is-back="true" />
    </div>

    <div class="absolute top-[40%] left-[10%] w-24 h-36">
      <Card :is-back="true" class="shadow-2xl" />
      <div class="absolute top-1 left-1 w-full h-full bg-gray-700 rounded-xl -z-10 border border-gray-600"></div>
      <div class="absolute top-2 left-2 w-full h-full bg-gray-700 rounded-xl -z-20 border border-gray-600"></div>
    </div>

  </div>
</template>
