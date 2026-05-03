<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
import { AlertTriangle } from 'lucide-vue-next';

const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((err) => {
  hasError.value = true;
  errorMessage.value = err instanceof Error ? err.message : String(err);
  console.error('[ErrorBoundary]', err);
  return false;
});

function retry() {
  hasError.value = false;
  errorMessage.value = '';
}
</script>

<template>
  <slot v-if="!hasError" />
  <div v-else class="error-boundary">
    <div class="error-content">
      <div class="error-icon"><AlertTriangle :size="32" class="text-amber-400" /></div>
      <h3 class="error-title">组件加载失败</h3>
      <p class="error-message">{{ errorMessage }}</p>
      <button class="error-retry-btn" @click="retry">重试</button>
    </div>
  </div>
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  min-height: 120px;
}

.error-content {
  text-align: center;
  max-width: 320px;
}

.error-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.error-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.error-message {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0 0 16px;
  word-break: break-word;
}

.error-retry-btn {
  padding: 6px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--color-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.error-retry-btn:hover {
  background: var(--hover-overlay);
  border-color: var(--border-strong);
}
</style>
