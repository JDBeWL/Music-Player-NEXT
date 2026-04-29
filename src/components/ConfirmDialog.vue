<script setup lang="ts">
import { X, AlertTriangle } from 'lucide-vue-next';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'warning' | 'danger';
}

const props = withDefaults(defineProps<Props>(), {
  title: '确认',
  confirmText: '确定',
  cancelText: '取消',
  variant: 'danger'
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function handleConfirm() {
  emit('confirm');
}

function handleCancel() {
  emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-overlay"
      @click.self="handleCancel"
      role="presentation"
    >
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? 'confirm-title' : undefined"
      >
        <div class="confirm-header">
          <div class="confirm-icon" :class="variant">
            <AlertTriangle :size="20" />
          </div>
          <h3 id="confirm-title" class="confirm-title">{{ title }}</h3>
          <button class="confirm-close" @click="handleCancel" aria-label="关闭对话框">
            <X :size="18" />
          </button>
        </div>

        <div class="confirm-body">
          <p>{{ message }}</p>
        </div>

        <div class="confirm-footer">
          <button class="btn-cancel" @click="handleCancel">{{ cancelText }}</button>
          <button class="btn-confirm" :class="variant" @click="handleConfirm">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.confirm-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  width: 360px;
  max-width: 90vw;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 0;
}

.confirm-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.confirm-icon.warning {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.confirm-icon.danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.confirm-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.confirm-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.confirm-close:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.confirm-body {
  padding: 16px 20px;
}

.confirm-body p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.confirm-footer {
  display: flex;
  gap: 12px;
  padding: 0 20px 20px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn-cancel {
  background: var(--hover-overlay);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--pressed-overlay);
  color: var(--text-primary);
}

.btn-confirm {
  color: white;
}

.btn-confirm.warning {
  background: #eab308;
}

.btn-confirm.warning:hover {
  background: #ca8a04;
}

.btn-confirm.danger {
  background: #ef4444;
}

.btn-confirm.danger:hover {
  background: #dc2626;
}
</style>
