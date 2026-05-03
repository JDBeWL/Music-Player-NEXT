<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-vue-next';
import { toast, type Toast, type ToastType } from '@/services/toast';

const toasts = ref<Toast[]>([]);

const iconMap: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const colorMap: Record<ToastType, string> = {
  info: 'var(--color-primary)',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
};

let unsub: (() => void) | null = null;

onMounted(() => {
  unsub = toast.subscribe((list) => {
    toasts.value = list;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="item in toasts"
          :key="item.id"
          class="toast-item"
          :class="`toast-${item.type}`"
          role="alert"
        >
          <component
            :is="iconMap[item.type]"
            class="toast-icon"
            :style="{ color: colorMap[item.type] }"
            :size="18"
          />
          <span class="toast-message">{{ item.message }}</span>
          <button class="toast-close" @click="toast.remove(item.id)" aria-label="关闭">
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 48px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: 400px;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  min-width: 280px;
}

.toast-icon {
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toast-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.25s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}

.toast-move {
  transition: transform 0.25s ease;
}
</style>
