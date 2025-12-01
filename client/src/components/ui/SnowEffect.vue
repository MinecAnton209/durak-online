<script setup>
const snowflakes = Array.from({ length: 150 }).map((_, i) => ({
  id: i,
  left: Math.random() * 100 + '%',
  animationDuration: Math.random() * 3 + 5 + 's',
  animationDelay: Math.random() * 5 + 's',
  opacity: Math.random() * 0.5 + 0.3,
  size: Math.random() * 5 + 3 + 'px'
}));
</script>

<template>
  <div class="snow-container pointer-events-none fixed inset-0 z-[50] overflow-hidden" aria-hidden="true">
    <div
      v-for="flake in snowflakes"
      :key="flake.id"
      class="snowflake absolute top-[-10px] bg-white rounded-full blur-[1px]"
      :style="{
        left: flake.left,
        width: flake.size,
        height: flake.size,
        opacity: flake.opacity,
        animationDuration: flake.animationDuration,
        animationDelay: flake.animationDelay
      }"
    ></div>
  </div>
</template>

<style scoped>
.snowflake {
  animation-name: fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

@keyframes fall {
  0% {
    transform: translateY(-10vh) translateX(-10px);
  }
  50% {
    transform: translateY(50vh) translateX(10px);
  }
  100% {
    transform: translateY(110vh) translateX(-10px);
  }
}
</style>
