import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useSocketStore } from './socket';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import i18n from '@/i18n';

export const useRouletteStore = defineStore('roulette', () => {
  const socketStore = useSocketStore();
  const authStore = useAuthStore();
  const toast = useToastStore();

  const phase = ref('waiting');
  const timer = ref(0);
  const history = ref([]);
  const winningNumber = ref(null);
  const myBets = ref([]);

  const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  function getNumberColor(num) {
    if (num === 0) return 'green';
    return RED_NUMBERS.includes(num) ? 'red' : 'black';
  }

  function initListeners() {
    const socket = socketStore.socket;
    if (!socket) return;

    socket.off('roulette:updateState');
    socket.off('roulette:timer');
    socket.off('roulette:win');
    socket.off('roulette:betAccepted');
    socket.off('roulette:betError');
    socket.off('updateBalance');

    socket.emit('roulette:getState');

    socket.on('roulette:updateState', (state) => {
      phase.value = state.phase;
      history.value = state.history || [];
      winningNumber.value = state.winningNumber;

      if (state.phase === 'betting') {
        myBets.value = [];
        winningNumber.value = null;
      }
    });

    socket.on('roulette:timer', (data) => {
      timer.value = data.timer;
      if (data.phase && data.phase !== phase.value) {
        phase.value = data.phase;
      }
    });

    socket.on('roulette:win', ({ amount }) => {
      toast.addToast(i18n.global.t('roulette_win_coins', { amount }), 'success', 5000);
      new Audio('/sounds/win.mp3').play().catch(() => null);
    });

    socket.on('updateBalance', ({ coins }) => {
      if (authStore.user) {
        authStore.user.coins = coins;
      }
    });

    socket.on('roulette:betAccepted', (bet) => {
      myBets.value.push(bet);
      new Audio('/sounds/chip.mp3').play().catch(() => null);
    });

    socket.on('roulette:betError', ({ messageKey }) => {
      toast.addToast(i18n.global.t(messageKey), 'error');
    });
  }

  function placeBet(type, value, amount) {
    if (phase.value !== 'betting') {
      return toast.addToast(i18n.global.t('roulette_bets_closed'), 'warning');
    }
    if (authStore.user.coins < amount) {
      return toast.addToast(i18n.global.t('error_not_enough_coins'), 'error');
    }

    socketStore.emit('roulette:placeBet', { type, value, amount });
  }

  function leave() {
  }

  return {
    phase, timer, history, winningNumber, myBets,
    getNumberColor, initListeners, placeBet, leave
  };
});
