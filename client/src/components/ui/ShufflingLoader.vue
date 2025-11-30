<template>
  <div class="flex flex-col items-center gap-4">
    <div class="relative w-16 h-24">
      <div class="absolute w-full h-full rounded-lg border border-black/20 bg-gradient-to-br from-primary to-[#008f7a] shadow-md custom-card-bg card-1"></div>
      <div class="absolute w-full h-full rounded-lg border border-black/20 bg-gradient-to-br from-primary to-[#008f7a] shadow-md custom-card-bg card-2"></div>
      <div class="absolute w-full h-full rounded-lg border border-black/20 bg-gradient-to-br from-primary to-[#008f7a] shadow-md custom-card-bg card-3"></div>
    </div>
    <p class="text-primary font-bold animate-pulse tracking-widest text-sm">{{ $t('shuffling_label') }}</p>
  </div>
</template>

<style scoped>
.custom-card-bg {
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 2px, transparent 2px, transparent 4px),
    linear-gradient(to bottom right, var(--color-primary), #008f7a);
}

.card-1 {
  animation: shuffleLeft 1.2s infinite ease-in-out;
  z-index: 1;
}

.card-2 {
  animation: shuffleRight 1.2s infinite ease-in-out;
  z-index: 2;
}

.card-3 {
  transform: rotate(0deg);
  z-index: 0;
}

@keyframes shuffleLeft {
  0% { transform: translateX(0) rotate(-5deg); z-index: 1; }
  50% { transform: translateX(-20px) rotate(-15deg); z-index: 1; }
  51% { z-index: 3; }
  100% { transform: translateX(0) rotate(-5deg); z-index: 3; }
}

@keyframes shuffleRight {
  0% { transform: translateX(0) rotate(5deg); z-index: 2; }
  50% { transform: translateX(20px) rotate(15deg); z-index: 2; }
  51% { z-index: 0; }
  100% { transform: translateX(0) rotate(5deg); z-index: 0; }
}
</style>
