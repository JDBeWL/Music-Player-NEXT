<script setup lang="ts">
import { ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

interface Props {
  open: boolean;
  title?: string;
  message?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '输入',
  message: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消'
});

const emit = defineEmits<{
  confirm: [value: string];
  cancel: [];
}>();

const inputValue = ref('');

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    inputValue.value = '';
  }
});

function handleConfirm() {
  if (inputValue.value.trim()) {
    emit('confirm', inputValue.value.trim());
  }
}

function handleCancel() {
  inputValue.value = '';
  emit('cancel');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && inputValue.value.trim()) {
    handleConfirm();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="prompt-overlay"
      @click.self="handleCancel"
      role="presentation"
    >
      <div
        class="prompt-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? 'prompt-title' : undefined"
      >
        <div class="prompt-header">
          <h3 id="prompt-title" class="prompt-title">{{ title }}</h3>
          <button class="prompt-close" @click="handleCancel" aria-label="关闭对话框">
            <X :size="18" />
          </button>
        </div>

        <div v-if="message" class="prompt-message">
          <p>{{ message }}</p>
        </div>

        <div class="prompt-body">
          <input
            v-model="inputValue"
            type="text"
            class="prompt-input"
            :placeholder="placeholder"
            aria-label="输入内容"
            @keydown="handleKeydown"
            autofocus
          />
        </div>

        <div class="prompt-footer">
          <button class="btn-cancel" @click="handleCancel">{{ cancelText }}</button>
          <button class="btn-confirm" :disabled="!inputValue.trim()" @click="handleConfirm">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.prompt-overlay {
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

.prompt-dialog {
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

.prompt-header {
  display: flex;
  align-items: center;
  padding: 20px 20px 0;
}

.prompt-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.prompt-close {
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

.prompt-close:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.prompt-message {
  padding: 12px 20px 0;
}

.prompt-message p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.prompt-body {
  padding: 16px 20px;
}

.prompt-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.15s;
  box-sizing: border-box;
}

.prompt-input::placeholder {
  color: var(--text-disabled);
}

.prompt-input:focus {
  border-color: var(--color-primary);
  background: var(--bg-surface);
}

.prompt-footer {
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
  background: var(--color-primary);
  color: var(--text-on-primary);
}

.btn-confirm:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-confirm:disabled {
  background: var(--color-primary-light);
  cursor: not-allowed;
}
</style>
