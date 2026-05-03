<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { ChevronDown, Music } from 'lucide-vue-next';
import ErrorBoundary from '@/components/common/ErrorBoundary.vue';
import LyricsDisplay from '@/components/player/LyricsDisplay.vue';
import { getCoverUrl } from '@/utils/coverUrl';

import type { AudioTrack } from '@/types';

interface Props {
  currentTrack: AudioTrack | null;
  currentTime: number;
  modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'seek': [time: number];
}>();

const playerBarHeight = ref(96);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const playerBar = document.querySelector('footer');
  if (playerBar) {
    playerBarHeight.value = playerBar.getBoundingClientRect().height;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        playerBarHeight.value = entry.contentRect.height;
      }
    });
    resizeObserver.observe(playerBar);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (activeMouseMove) {
    window.removeEventListener('mousemove', activeMouseMove);
    activeMouseMove = null;
  }
  if (activeMouseUp) {
    window.removeEventListener('mouseup', activeMouseUp);
    activeMouseUp = null;
  }
});

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const drawerRef = ref<HTMLElement | null>(null);

const dragOffsetY = ref(0);
const isDragging = ref(false);
const isTransitioning = ref(false);

const overlayOpacity = computed(() => {
  if (!isOpen.value && !isDragging.value) return 0;
  if (isDragging.value) {
    const maxDrag = window.innerHeight - playerBarHeight.value;
    return Math.max(0, 1 - dragOffsetY.value / maxDrag);
  }
  return 1;
});

function closeDrawer() {
  isTransitioning.value = true;
  isOpen.value = false;
  setTimeout(() => {
    isTransitioning.value = false;
    dragOffsetY.value = 0;
  }, 400);
}

watch(() => props.modelValue, (val) => {
  if (val) {
    isTransitioning.value = true;
    setTimeout(() => { isTransitioning.value = false; }, 400);
  } else {
    isTransitioning.value = true;
    setTimeout(() => {
      isTransitioning.value = false;
      dragOffsetY.value = 0;
    }, 400);
  }
});

let startY = 0;
let currentY = 0;
let dragStarted = false;
let activeMouseMove: ((ev: MouseEvent) => void) | null = null;
let activeMouseUp: (() => void) | null = null;

function onDragStart(clientY: number) {
  startY = clientY;
  currentY = clientY;
  dragStarted = false;
  isDragging.value = true;
  isTransitioning.value = false;
}

function onDragMove(clientY: number) {
  if (!isDragging.value) return;
  currentY = clientY;
  const delta = currentY - startY;
  if (Math.abs(delta) > 5) dragStarted = true;
  dragOffsetY.value = Math.max(0, delta);
}

function onDragEnd() {
  if (!isDragging.value) return;
  isDragging.value = false;
  isTransitioning.value = true;

  const maxDrag = window.innerHeight - playerBarHeight.value;
  const threshold = maxDrag * 0.25;

  if (dragOffsetY.value > threshold) {
    closeDrawer();
  } else {
    dragOffsetY.value = 0;
    setTimeout(() => { isTransitioning.value = false; }, 400);
  }
}

function onTouchStart(e: TouchEvent) {
  if (!isOpen.value) return;
  onDragStart(e.touches[0].clientY);
}

function onTouchMove(e: TouchEvent) {
  onDragMove(e.touches[0].clientY);
}

function onTouchEnd() {
  onDragEnd();
}

function onMouseDown(e: MouseEvent) {
  if (!isOpen.value) return;
  e.preventDefault();
  onDragStart(e.clientY);

  const onMouseMove = (ev: MouseEvent) => onDragMove(ev.clientY);
  const onMouseUp = () => {
    onDragEnd();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    activeMouseMove = null;
    activeMouseUp = null;
  };

  activeMouseMove = onMouseMove;
  activeMouseUp = onMouseUp;

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function onOverlayClick() {
  if (!isDragging.value || !dragStarted) {
    closeDrawer();
  }
}

function onWheel(e: WheelEvent) {
  if (!isOpen.value) return;
  const target = e.target as HTMLElement;
  if (!target.closest('.drag-handle')) return;
  if (drawerRef.value && drawerRef.value.scrollTop <= 0 && e.deltaY < 0) {
    closeDrawer();
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="now-playing-drawer-container">
      <Transition name="overlay-fade">
        <div
          v-if="isOpen || isDragging"
          class="drawer-overlay"
          :style="{ opacity: overlayOpacity }"
          @click="onOverlayClick"
        />
      </Transition>

      <div
        ref="drawerRef"
        class="drawer-panel glass-surface"
        :class="{
          'drawer-open': isOpen && !isDragging,
          'drawer-closed': !isOpen && !isDragging,
          'drawer-dragging': isDragging,
          'drawer-transitioning': isTransitioning && !isDragging,
        }"
        :style="{
          transform: isDragging
            ? `translateY(${dragOffsetY}px)`
            : undefined,
        }"
        @wheel="onWheel"
      >
        <div
          class="drag-handle"
          @mousedown="onMouseDown"
          @touchstart.passive="onTouchStart"
          @touchmove.passive="onTouchMove"
          @touchend="onTouchEnd"
        >
          <div class="drag-indicator" />
        </div>

        <button class="close-btn md3-icon-btn" @click="closeDrawer" aria-label="关闭">
          <ChevronDown :size="28" />
        </button>

        <div v-if="currentTrack" class="drawer-content">
          <div class="left-column">
            <div class="left-content">
              <div class="cover-wrapper">
                <div class="cover-container">
                  <img
                    v-if="currentTrack.coverUrl"
                    :src="getCoverUrl(currentTrack.coverUrl)"
                    alt="专辑封面"
                    class="cover-image"
                  />
                  <div v-else class="cover-image cover-placeholder">
                    <Music :size="120" class="text-[var(--text-tertiary)]" />
                  </div>
                </div>
              </div>

              <div class="track-info">
                <h1 class="text-3xl font-bold text-[var(--text-primary)] mt-2 mb-2 line-clamp-2">{{ currentTrack.title }}</h1>
                <p class="text-lg text-[var(--text-tertiary)] mb-1 line-clamp-1">{{ currentTrack.artist }}</p>
                <p v-if="currentTrack.album" class="text-base text-[var(--text-disabled)] line-clamp-2">{{ currentTrack.album }}</p>
              </div>
            </div>
          </div>

          <div class="overflow-hidden" style="flex: 0 0 60%; max-width: 60%; padding: 0 0 0 2%; box-sizing: border-box;">
            <ErrorBoundary>
              <LyricsDisplay @seek="emit('seek', $event)" />
            </ErrorBoundary>
          </div>
        </div>

        <div v-else class="drawer-content drawer-empty">
          <div class="text-center">
            <div class="w-20 h-20 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center mx-auto mb-4">
              <Music :size="40" class="text-[var(--text-tertiary)]" />
            </div>
            <p class="text-[var(--text-tertiary)]">当前没有播放的歌曲</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.now-playing-drawer-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: v-bind(playerBarHeight + 'px');
  z-index: 1000;
  pointer-events: none;
  overflow: hidden;
}

.drawer-overlay {
  position: absolute;
  inset: 0;
  background: transparent;
  pointer-events: auto;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.35s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.drawer-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  backdrop-filter: var(--glass-blur) var(--glass-saturate);
  -webkit-backdrop-filter: var(--glass-blur) var(--glass-saturate);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  will-change: transform;
}

.glass-surface {
  background: var(--glass-bg);
}

.drawer-transitioning {
  transition: transform 0.38s cubic-bezier(0.32, 0.72, 0, 1);
}

.drawer-open {
  transform: translateY(0);
}

.drawer-closed {
  transform: translateY(100%);
  pointer-events: none;
}

.drawer-dragging {
  transition: none;
}

.drag-handle {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  z-index: 2;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-indicator {
  width: 40px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--text-disabled);
  transition: background 0.2s;
}

.drag-handle:hover .drag-indicator {
  background: var(--text-tertiary);
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 16px;
  z-index: 3;
}

.drawer-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  justify-content: center;
  padding: 0 16px;
}

.drawer-empty {
  align-items: center;
}

.left-column {
  flex: 0 0 40%;
  max-width: 40%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2% 0 2% 8%;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
}

.left-content {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.cover-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}

.cover-container {
  aspect-ratio: 1;
  max-width: 100%;
  max-height: 55vh;
  border-radius: var(--radius-2xl);
  overflow: hidden;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-placeholder {
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.track-info {
  flex-shrink: 0;
  text-align: center;
  padding-top: 16px;
  padding-bottom: 8px;
  width: 100%;
}
</style>