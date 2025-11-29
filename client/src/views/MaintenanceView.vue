<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const message = route.query.msg || "Ми оновлюємо сервери, щоб гра стала ще кращою! Будь ласка, зайдіть трохи пізніше.";
const etaTimestamp = parseInt(route.query.eta || 0);

const countdown = ref('--:--:--');
let interval = null;

const updateTimer = () => {
  if (!etaTimestamp) return;
  const now = Date.now();
  const timeLeft = etaTimestamp - now;

  if (timeLeft <= 0) {
    countdown.value = "Скоро завершимо!";
    if (interval) clearInterval(interval);
    return;
  }

  const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
  const seconds = Math.floor((timeLeft / 1000) % 60);

  countdown.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

onMounted(() => {
  if (etaTimestamp) {
    updateTimer();
    interval = setInterval(updateTimer, 1000);
  }
});

onUnmounted(() => {
  if (interval) clearInterval(interval);
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface text-on-surface p-4 relative overflow-hidden">

    <div class="w-full max-w-xl bg-black/20 rounded-[28px] border border-outline/30 p-8 md:p-12 text-center shadow-xl backdrop-blur-sm">

      <div class="relative w-32 h-32 mx-auto mb-8">
        <div class="absolute inset-0 text-[100px] leading-none animate-spin-slow drop-shadow-[0_0_15px_var(--color-primary)] opacity-90">⚙️</div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] text-[60px] leading-none animate-spin-reverse opacity-80">🔧</div>
      </div>

      <h1 class="text-3xl md:text-4xl font-bold mb-4 text-white">Ведуться технічні роботи</h1>

      <p class="text-lg text-on-surface-variant mb-8 leading-relaxed">
        {{ message }}
      </p>

      <div v-if="etaTimestamp" class="inline-block bg-black/30 px-6 py-3 rounded-xl border border-white/5 font-mono text-xl font-bold text-primary">
        Орієнтовно: <span class="text-white">{{ countdown }}</span>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-spin-slow { animation: spin 10s linear infinite; }
.animate-spin-reverse { animation: spinReverse 8s linear infinite; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spinReverse {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(-360deg); }
}
</style>
