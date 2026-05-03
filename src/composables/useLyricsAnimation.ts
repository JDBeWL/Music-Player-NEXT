import { ref, watch } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';

export function useLyricsAnimation() {
  const playbackStore = usePlaybackStore();

  const visualTime = ref(0);
  let rafId: number | null = null;
  let lastFrameTime = 0;
  let isPageVisible = true;

  function handleVisibilityChange() {
    isPageVisible = !document.hidden;
    if (isPageVisible && playbackStore.isPlaying && rafId === null) {
      startAnimationLoop();
    }
  }

  function startAnimationLoop() {
    if (rafId !== null) return;
    lastFrameTime = 0;
    visualTime.value = playbackStore.currentTime;

    const animate = (timestamp: number) => {
      if (!isPageVisible) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        return;
      }

      if (!lastFrameTime) lastFrameTime = timestamp;
      const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
      lastFrameTime = timestamp;

      const realTime = playbackStore.currentTime;
      const diff = visualTime.value - realTime;

      if (Math.abs(diff) > 0.5) {
        visualTime.value = realTime;
      } else if (Math.abs(diff) > 0.05) {
        const speed = 1.0 - diff * 2.0;
        const clampedSpeed = Math.max(0.7, Math.min(1.3, speed));
        visualTime.value += deltaTime * clampedSpeed;
      } else {
        visualTime.value += deltaTime;
      }

      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
  }

  function stopAnimationLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  watch(
    () => playbackStore.isPlaying,
    (isPlaying) => {
      if (isPlaying) {
        startAnimationLoop();
      } else {
        stopAnimationLoop();
        visualTime.value = playbackStore.currentTime;
      }
    },
    { immediate: true }
  );

  watch(
    () => playbackStore.currentTime,
    (newTime, oldTime) => {
      const jump = newTime - (oldTime ?? newTime);
      if (Math.abs(jump) > 1.5 || jump < -0.1) {
        visualTime.value = newTime;
      }
    }
  );

  return {
    visualTime,
    startAnimationLoop,
    stopAnimationLoop,
    handleVisibilityChange,
  };
}
