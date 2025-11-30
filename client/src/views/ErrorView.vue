<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
const code = route.query.code || '404';
const msg = route.query.msg || 'Сторінку не знайдено';
const desc = route.query.desc || 'Здається, ви заблукали. Карта, яку ви шукали, знаходиться в іншій колоді.';
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background relative overflow-hidden font-sans p-4 select-none">
    <div class="absolute inset-0 pointer-events-none opacity-60">

      <div class="card-scene absolute top-[10%] left-[5%] animate-float-1">
        <div class="card-flipper animate-spin-slow">
          <div class="card-face card-front">?</div>
          <div class="card-face card-back"></div>
        </div>
      </div>

      <div class="card-scene absolute top-[15%] right-[10%] animate-float-2">
        <div class="card-flipper animate-spin-slow" style="animation-delay: -2s;">
          <div class="card-face card-front">?</div>
          <div class="card-face card-back"></div>
        </div>
      </div>

      <div class="card-scene absolute bottom-[20%] left-[20%] animate-float-3">
        <div class="card-flipper animate-spin-slow" style="animation-delay: -8s;">
          <div class="card-face card-front">?</div>
          <div class="card-face card-back"></div>
        </div>
      </div>

      <div class="card-scene absolute bottom-[10%] right-[5%] animate-float-4">
        <div class="card-flipper animate-spin-slow" style="animation-delay: -6s;">
          <div class="card-face card-front">?</div>
          <div class="card-face card-back"></div>
        </div>
      </div>

      <div class="card-scene absolute top-[70%] left-[8%] animate-float-5">
        <div class="card-flipper animate-spin-slow" style="animation-delay: -12s;">
          <div class="card-face card-front">?</div>
          <div class="card-face card-back"></div>
        </div>
      </div>

    </div>

    <div class="relative z-10 w-full max-w-lg bg-surface/85 backdrop-blur-md rounded-[28px] border border-white/10 p-8 md:p-12 text-center shadow-2xl">
      <h1 class="text-8xl font-bold text-primary mb-0 drop-shadow-[0_0_20px_rgba(0,191,165,0.5)]">{{ code }}</h1>
      <p class="text-2xl font-bold text-white my-4">{{ msg }}</p>
      <p class="text-on-surface-variant mb-8 max-w-md mx-auto">{{ desc }}</p>

      <router-link to="/" class="inline-block bg-primary hover:bg-[#00A891] text-on-primary font-bold text-lg py-3 px-8 rounded-xl shadow-lg transition-transform active:scale-95">
        {{ $t('go_home') }}
      </router-link>
    </div>

  </div>
</template>

<style scoped>
.card-scene {
  width: 60px; height: 84px;
  perspective: 800px;
}
@media (min-width: 768px) {
  .card-scene { width: 90px; height: 126px; }
}

.card-flipper {
  width: 100%; height: 100%;
  position: relative;
  transform-style: preserve-3d;
  animation: spin-card 15s infinite linear;
}

.card-face {
  position: absolute;
  width: 100%; height: 100%;
  backface-visibility: hidden;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-front {
  background-color: #fdfdfd;
  color: var(--color-surface);
  font-size: 2rem;
  font-weight: 700;
  z-index: 2;
}

.card-back {
  background: linear-gradient(135deg, #475569, #334155);
  border: 1px solid #1e293b;
  transform: rotateY(180deg);

  background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 4px);
}

@keyframes spin-card {
  from { transform: rotateY(0deg) rotateX(5deg) rotateZ(-3deg); }
  to { transform: rotateY(360deg) rotateX(-5deg) rotateZ(3deg); }
}

.animate-float-1 { animation: float1 22s infinite ease-in-out alternate; }
.animate-float-2 { animation: float2 18s infinite ease-in-out alternate; }
.animate-float-3 { animation: float3 25s infinite ease-in-out alternate; }
.animate-float-4 { animation: float4 15s infinite ease-in-out alternate; }
.animate-float-5 { animation: float4 28s infinite ease-in-out alternate; }

@keyframes float1 { from { transform: translate(0, 0) rotate(-15deg); } to { transform: translate(10vw, 30vh) rotate(15deg); } }
@keyframes float2 { from { transform: translate(0, 0) rotate(20deg); } to { transform: translate(-20vw, -10vh) rotate(-20deg); } }
@keyframes float3 { from { transform: translate(0, 0) rotate(10deg); } to { transform: translate(30vw, -40vh) rotate(-10deg); } }
@keyframes float4 { from { transform: translate(0, 0) rotate(-25deg); } to { transform: translate(-15vw, 20vh) rotate(25deg); } }
</style>
