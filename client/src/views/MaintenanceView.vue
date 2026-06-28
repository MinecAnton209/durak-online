<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const params = new URLSearchParams(window.location.search);
const message = ref(params.get('msg') || t('maintenance_default_message'));
const etaTimestamp = parseInt(params.get('eta') || 0);

const countdown = ref('--:--:--');
let interval = null;

const circumference = 2 * Math.PI * 54;
const strokeDashoffset = ref(0);

const updateTimer = () => {
  if (!etaTimestamp) return;
  const now = Date.now();
  const total = etaTimestamp - now;

  if (total <= 0) {
    countdown.value = t('maintenance_complete_soon');
    strokeDashoffset.value = circumference;
    if (interval) clearInterval(interval);
    return;
  }
  const progress = Math.min(total / 7200000, 1);
  strokeDashoffset.value = circumference * (1 - progress);

  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  countdown.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  <div class="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
    style="background: radial-gradient(circle at center, #1b5e20 0%, #0f4a1e 100%)">

    <!-- Orbs -->
    <div aria-hidden="true" class="pointer-events-none fixed inset-0">
      <div class="absolute -top-32 -right-32 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] animate-orb-1"></div>
      <div class="absolute -bottom-32 -left-32 w-[350px] h-[350px] bg-purple-600/8 rounded-full blur-[80px] animate-orb-2"></div>
    </div>

    <div class="w-full max-w-md relative animate-enter">

      <!-- Card -->
      <div class="bg-surface/95 backdrop-blur-sm rounded-3xl border border-white/5 shadow-2xl p-9 text-center">

        <!-- Icon -->
        <div class="relative w-20 h-20 mx-auto mb-7">
          <svg class="absolute inset-0 w-20 h-20 -rotate-90" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="54" stroke="rgba(255,255,255,.06)" stroke-width="2"/>
            <circle
              cx="60" cy="60" r="54"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="text-primary"
              :style="etaTimestamp ? { strokeDasharray: circumference, strokeDashoffset } : { strokeDasharray: '0 0' }"
            />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <svg class="w-10 h-10 text-primary/50 animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            </svg>
          </div>
        </div>

        <!-- Badge -->
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-5">
          <span class="relative flex w-1.5 h-1.5">
            <span class="absolute inset-0 rounded-full bg-primary animate-ping-slow opacity-60"></span>
            <span class="relative rounded-full bg-primary w-1.5 h-1.5"></span>
          </span>
          <span class="text-primary text-[11px] font-semibold uppercase tracking-[0.15em]">{{ t('maintenance_title') }}</span>
        </div>

        <!-- Title -->
        <h1 class="text-2xl font-bold text-white mb-3 tracking-tight">
          {{ t('maintenance_subtitle') }}
        </h1>

        <!-- Message -->
        <p class="text-sm text-on-surface-variant/70 leading-relaxed max-w-xs mx-auto">
          {{ message }}
        </p>

        <!-- Countdown -->
        <div v-if="etaTimestamp" class="mt-7 pt-6 border-t border-white/5">
          <p class="text-[10px] text-on-surface-variant/30 uppercase tracking-[0.2em] font-semibold mb-3">
            {{ t('maintenance_eta_label') }}
          </p>
          <div class="font-mono text-[1.75rem] font-bold tracking-[0.12em] text-white/80 tabular-nums leading-none">
            {{ countdown }}
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex items-center justify-center gap-3 mt-7">
        <div class="w-5 h-px bg-white/5"></div>
        <span class="text-[10px] text-white/20 uppercase tracking-[0.2em] font-medium">Durak Online</span>
        <div class="w-5 h-px bg-white/5"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-enter {
  animation: enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes enter {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.animate-spin-slow {
  animation: spin 10s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-ping-slow {
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes ping {
  75%, 100% { transform: scale(2.5); opacity: 0; }
}

.animate-orb-1 {
  animation: orb1 10s ease-in-out infinite;
}

.animate-orb-2 {
  animation: orb2 10s ease-in-out 5s infinite;
}

@keyframes orb1 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-40px, 40px); }
}

@keyframes orb2 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(40px, -40px); }
}
</style>
