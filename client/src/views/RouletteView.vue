<script setup>
import { onMounted, ref, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRouletteStore } from '@/stores/roulette';
import { useAuthStore } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';

const router = useRouter();
const store = useRouletteStore();
const authStore = useAuthStore();
const socketStore = useSocketStore();

const betAmount = ref(10);
const displayedNumber = ref('?');
let spinInterval = null;

const getBetTotal = (val) => {
  return store.myBets
    .filter(b => b.value == val)
    .reduce((total, bet) => total + bet.amount, 0);
};

onMounted(() => {
  if (!socketStore.isConnected) socketStore.connect();
  store.initListeners();
});

onUnmounted(() => {
  if (spinInterval) clearInterval(spinInterval);
  store.leave();
});

watch(() => store.phase, (newPhase) => {
  if (newPhase === 'spinning') {
    startSpinAnimation();
  } else if (newPhase === 'results') {
    stopSpinAnimation();
  } else {
    displayedNumber.value = '?';
  }
});

const startSpinAnimation = () => {
  if (spinInterval) clearInterval(spinInterval);
  spinInterval = setInterval(() => {
    displayedNumber.value = Math.floor(Math.random() * 37);
  }, 50);
};

const stopSpinAnimation = () => {
  if (spinInterval) clearInterval(spinInterval);
  displayedNumber.value = store.winningNumber;
};

const setBetAmount = (amt) => {
  if (amt === 'max') betAmount.value = authStore.user?.coins || 0;
  else betAmount.value = amt;
};

const makeBet = (type, value) => {
  store.placeBet(type, value, betAmount.value);
};

const numbers = Array.from({ length: 36 }, (_, i) => i + 1);

const getCellClass = (num) => {
  const color = store.getNumberColor(num);
  if (color === 'red') return 'bg-red-600 border-red-800 text-white';
  if (color === 'black') return 'bg-gray-900 border-gray-700 text-white';
  return 'bg-green-600 border-green-800 text-white';
};
</script>

<template>
  <div class="min-h-screen bg-[#0f2a1d] flex flex-col items-center p-2 md:p-4 overflow-y-auto font-sans">

    <div
      class="w-full max-w-4xl flex justify-between items-center mb-4 md:mb-6 sticky top-0 bg-[#0f2a1d]/90 backdrop-blur-sm z-20 py-2">
      <button @click="router.push('/')"
              class="text-white/70 hover:text-white flex items-center gap-2 font-bold transition-colors text-sm md:text-base">
        ⬅ <span class="hidden md:inline">{{ $t('go_home') }}</span>
      </button>
      <div
        class="bg-black/40 px-4 py-1.5 md:px-6 md:py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-lg">
        <span class="text-lg md:text-xl">💰</span>
        <span class="text-yellow-400 font-bold text-lg md:text-xl font-mono">{{ authStore.user?.coins || 0
          }}</span>
      </div>
    </div>

    <div class="w-full max-w-4xl flex flex-col gap-4 md:gap-6 pb-20">

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div
          class="order-2 md:order-1 bg-surface/50 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-row md:flex-col justify-between md:justify-center items-center">
          <h3
            class="text-on-surface-variant text-xs md:text-sm uppercase tracking-widest font-bold mb-0 md:mb-2">
            {{ $t('status_label') }}</h3>
          <div class="flex items-center gap-4 md:block md:text-center">
            <div class="text-xl md:text-3xl font-bold" :class="{
                            'text-green-400': store.phase === 'betting',
                            'text-yellow-400': store.phase === 'spinning',
                            'text-primary': store.phase === 'results'
                        }">
              {{ store.phase === 'betting' ? $t('roulette_phase_betting') : (store.phase === 'spinning' ? $t('roulette_phase_spinning') :
              $t('roulette_phase_results')) }}
            </div>
            <div class="text-4xl md:text-6xl font-mono md:mt-2 text-white tabular-nums">{{ store.timer }}
            </div>
          </div>
        </div>

        <div
          class="order-1 md:order-2 bg-black/40 rounded-2xl p-4 border-4 border-yellow-600/50 flex items-center justify-center relative shadow-[0_0_50px_rgba(255,215,0,0.1)] h-40 md:h-auto">
          <div class="absolute inset-0 rounded-xl border border-white/10"></div>
          <transition name="bounce">
            <div :key="displayedNumber"
                 class="w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center text-5xl md:text-6xl font-bold border-8 shadow-2xl transition-colors duration-200"
                 :class="{
                                'bg-green-600 border-green-800 text-white': store.getNumberColor(displayedNumber) === 'green',
                                'bg-red-600 border-red-800 text-white': store.getNumberColor(displayedNumber) === 'red',
                                'bg-gray-900 border-gray-700 text-white': store.getNumberColor(displayedNumber) === 'black',
                                'bg-gray-700 border-gray-600 text-gray-400': displayedNumber === '?'
                            }">
              {{ displayedNumber }}
            </div>
          </transition>
        </div>

        <div
          class="order-3 bg-surface/50 backdrop-blur-md rounded-2xl p-3 md:p-4 border border-white/5 overflow-hidden">
          <h3
            class="text-on-surface-variant text-xs md:text-sm uppercase tracking-widest font-bold mb-2 md:mb-3">
            {{ $t('roulette_recent_label') }}</h3>
          <div
            class="flex md:flex-wrap gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-hide">
            <div v-for="(num, idx) in store.history" :key="idx"
                 class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0"
                 :class="{
                                'bg-green-600 border-green-700 text-white': store.getNumberColor(num) === 'green',
                                'bg-red-600 border-red-700 text-white': store.getNumberColor(num) === 'red',
                                'bg-gray-900 border-gray-700 text-white': store.getNumberColor(num) === 'black',
                                'opacity-50': idx > 5
                            }">
              {{ num }}
            </div>
          </div>
        </div>
      </div>

      <div class="bg-surface/90 backdrop-blur-xl rounded-3xl border border-white/10 p-4 md:p-6 shadow-2xl">

        <div class="flex flex-col md:flex-row items-center justify-center gap-4 mb-6">
          <div class="relative w-full md:w-auto">
            <input type="number" v-model="betAmount"
                   class="w-full md:w-32 bg-black/30 border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-center text-xl focus:outline-none focus:border-yellow-500 transition-colors">
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-500">💰</span>
          </div>

          <div class="flex gap-2 w-full md:w-auto justify-center">
            <button @click="setBetAmount(10)"
                    class="w-12 h-12 rounded-full border-4 shadow-lg flex items-center justify-center text-xs font-bold active:scale-95 transition-transform bg-blue-600 border-blue-400 text-white">+10</button>
            <button @click="setBetAmount(50)"
                    class="w-12 h-12 rounded-full border-4 shadow-lg flex items-center justify-center text-xs font-bold active:scale-95 transition-transform bg-purple-600 border-purple-400 text-white">+50</button>
            <button @click="setBetAmount(100)"
                    class="w-12 h-12 rounded-full border-4 shadow-lg flex items-center justify-center text-xs font-bold active:scale-95 transition-transform bg-red-600 border-red-400 text-white">+100</button>
            <button @click="setBetAmount('max')"
                    class="w-12 h-12 rounded-full border-4 shadow-lg flex items-center justify-center text-xs font-bold active:scale-95 transition-transform bg-yellow-600 border-yellow-400 text-white font-bold">MAX</button>
          </div>
        </div>

        <div class="flex flex-col md:flex-row gap-4 select-none">

          <div @click="makeBet('number', 0)"
               class="h-12 md:h-auto md:w-16 bg-green-600 hover:bg-green-500 border-2 border-green-800 rounded-lg flex items-center justify-center text-white font-bold text-2xl cursor-pointer transition-all active:scale-95 shadow-md relative group">
            0
            <div v-if="getBetTotal(0) > 0"
                 class="absolute -top-2 -right-2 bg-yellow-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border border-yellow-300 z-10">
              {{ getBetTotal(0) }}
            </div>
          </div>

          <div class="flex-1 grid grid-cols-3 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
            <div v-for="num in numbers" :key="num" @click="makeBet('number', num)"
                 class="aspect-square flex items-center justify-center text-lg font-bold rounded cursor-pointer border-b-4 active:border-b-0 active:translate-y-1 transition-all relative"
                 :class="getCellClass(num) + ' hover:brightness-110'">
              {{ num }}

              <div v-if="getBetTotal(num) > 0"
                   class="absolute -top-2 -right-2 bg-yellow-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border border-yellow-300 z-10">
                {{ getBetTotal(num) }}
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 pb-4">
          <button @click="makeBet('even-odd', 'even')"
                  class="py-3 md:py-4 rounded-lg border-b-4 text-white font-bold active:border-b-0 active:translate-y-1 transition-all relative bg-blue-900 border-blue-700 text-sm md:text-base">
            {{ $t('bet_even') }}
            <div v-if="getBetTotal('even') > 0"
                 class="absolute -top-2 -right-2 bg-yellow-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border border-yellow-300 z-10">
              {{ getBetTotal('even') }}</div>
          </button>

          <button @click="makeBet('even-odd', 'odd')"
                  class="py-3 md:py-4 rounded-lg border-b-4 text-white font-bold active:border-b-0 active:translate-y-1 transition-all relative bg-blue-900 border-blue-700 text-sm md:text-base">
            {{ $t('bet_odd') }}
            <div v-if="getBetTotal('odd') > 0"
                 class="absolute -top-2 -right-2 bg-yellow-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border border-yellow-300 z-10">
              {{ getBetTotal('odd') }}</div>
          </button>

          <button @click="makeBet('color', 'red')"
                  class="py-3 md:py-4 rounded-lg border-b-4 text-white font-bold active:border-b-0 active:translate-y-1 transition-all relative bg-red-800 border-red-600 text-sm md:text-base">
            {{ $t('bet_red') }}
            <div v-if="getBetTotal('red') > 0"
                 class="absolute -top-2 -right-2 bg-yellow-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border border-yellow-300 z-10">
              {{ getBetTotal('red') }}</div>
          </button>

          <button @click="makeBet('color', 'black')"
                  class="py-3 md:py-4 rounded-lg border-b-4 text-white font-bold active:border-b-0 active:translate-y-1 transition-all relative bg-gray-900 border-gray-600 text-sm md:text-base">
            {{ $t('bet_black') }}
            <div v-if="getBetTotal('black') > 0"
                 class="absolute -top-2 -right-2 bg-yellow-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border border-yellow-300 z-10">
              {{ getBetTotal('black') }}</div>
          </button>
        </div>

      </div>

    </div>
  </div>
</template>

<style scoped>
.bounce-enter-active {
  animation: bounce-in 0.5s;
}

@keyframes bounce-in {
  0% {
    transform: scale(0);
  }

  50% {
    transform: scale(1.2);
  }

  100% {
    transform: scale(1);
  }
}
</style>
