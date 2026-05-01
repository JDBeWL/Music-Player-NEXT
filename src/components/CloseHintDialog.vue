<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '@/stores/configStore';

const configStore = useConfigStore();

const showCloseHintDialog = ref(false);
const rememberCloseChoice = ref(false);

function open() {
  showCloseHintDialog.value = true;
}

function handleCloseHintConfirm(remember: boolean) {
  if (remember) {
    configStore.setCloseBehavior('quit');
  }
  showCloseHintDialog.value = false;
  invoke('quit_app').catch(console.error);
}

async function handleCloseHintCancel(remember: boolean) {
  if (remember) {
    await configStore.setCloseBehavior('to_tray');
  }
  showCloseHintDialog.value = false;
  await invoke('hide_window').catch(console.error);
}

function handleCloseHintDismiss() {
  showCloseHintDialog.value = false;
}

defineExpose({ open });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showCloseHintDialog"
      class="close-hint-overlay"
      @click.self="handleCloseHintDismiss"
      role="presentation"
    >
      <div
        class="close-hint-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-hint-title"
      >
        <div class="close-hint-header">
          <h3 id="close-hint-title" class="close-hint-title">选择关闭行为</h3>
          <button class="close-hint-close" @click="handleCloseHintDismiss" aria-label="关闭对话框">
            <X :size="18" />
          </button>
        </div>

        <div class="close-hint-body">
          <p>关闭按钮将直接退出应用。如果想最小化到托盘，请在设置中修改关闭按钮行为。您希望如何处理？</p>
          <label class="close-hint-remember">
            <input
              v-model="rememberCloseChoice"
              type="checkbox"
              class="close-hint-checkbox"
            />
            <span>记住我的选择，不再询问</span>
          </label>
        </div>

        <div class="close-hint-footer">
          <button class="btn-cancel" @click="handleCloseHintCancel(rememberCloseChoice)">最小化到托盘</button>
          <button class="btn-confirm warning" @click="handleCloseHintConfirm(rememberCloseChoice)">直接退出</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.close-hint-overlay {
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

.close-hint-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.2s ease;
}

.close-hint-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 0;
}

.close-hint-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.close-hint-close {
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

.close-hint-close:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.close-hint-body {
  padding: 16px 20px;
}

.close-hint-body p {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.close-hint-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.close-hint-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.close-hint-footer {
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
  color: var(--text-on-primary);
}

.btn-confirm.warning {
  background: #eab308;
}

.btn-confirm.warning:hover {
  background: #ca8a04;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
