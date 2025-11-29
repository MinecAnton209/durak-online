<script setup>
import { computed } from 'vue';

const props = defineProps({
  rank: { type: String, default: '' },
  suit: { type: String, default: '' },
  isBack: { type: Boolean, default: false },
  isPlayable: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
  cardStyle: { type: String, default: 'default' }
});

const emit = defineEmits(['click']);

const isRed = computed(() => ['♥', '♦'].includes(props.suit));

const getBackStyleClasses = (style) => {
  switch (style) {
    case 'red': return 'from-red-900 to-red-700 border-red-950';
    case 'blue': return 'from-blue-900 to-blue-700 border-blue-950';
    case 'green': return 'from-green-900 to-green-700 border-green-950';
    case 'purple': return 'from-purple-900 to-purple-700 border-purple-950';
    case 'gold': return 'from-yellow-700 to-yellow-500 border-yellow-800';
    default: return 'from-slate-700 to-slate-600 border-slate-800';
  }
};

const cardClasses = computed(() => [
  'relative shrink-0 w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-36 rounded-lg md:rounded-xl',

  'shadow-md border border-black/20 select-none',

  'overflow-hidden will-change-transform backface-hidden transform-gpu',

  props.isBack
    ? `bg-gradient-to-br ${getBackStyleClasses(props.cardStyle)}`
    : 'bg-white',

  props.isPlayable && !props.isBack
    ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-2 md:hover:-translate-y-4 hover:shadow-xl hover:z-10'
    : '',

  !props.isBack && isRed.value ? 'text-red-600' : 'text-slate-900'
]);

const handleClick = () => {
  if (!props.isBack && props.isPlayable) emit('click');
};
</script>

<template>
  <div :class="cardClasses" @click="handleClick">

    <div v-if="isBack" class="w-full h-full relative">
      <div
        class="absolute inset-1 border border-dashed border-white/30 rounded md:rounded-lg opacity-30 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]">
      </div>

      <div class="absolute inset-0 flex items-center justify-center opacity-20 text-white">
        <span class="text-2xl md:text-4xl">♠</span>
      </div>
    </div>

    <div v-else class="w-full h-full relative font-bold font-mono leading-none">

      <div class="absolute top-1 left-1 flex flex-col items-center">
        <span class="text-sm sm:text-base md:text-xl">{{ rank }}</span>
        <span class="text-sm sm:text-base md:text-xl -mt-0.5">{{ suit }}</span>
      </div>

      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span class="text-4xl sm:text-5xl md:text-6xl opacity-100">{{ suit }}</span>
      </div>

      <div class="absolute bottom-1 right-1 flex flex-col items-center rotate-180">
        <span class="text-sm sm:text-base md:text-xl">{{ rank }}</span>
        <span class="text-sm sm:text-base md:text-xl -mt-0.5">{{ suit }}</span>
      </div>
    </div>

  </div>
</template>
