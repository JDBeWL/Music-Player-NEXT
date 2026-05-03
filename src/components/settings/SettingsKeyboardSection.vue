<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Keyboard, RotateCcw } from 'lucide-vue-next';
import { useConfigStore } from '@/stores/configStore';
import type { KeyboardShortcut } from '@/types';

const configStore = useConfigStore();

const recordingAction = ref<string | null>(null);

const actionLabels: Record<string, string> = {
  togglePlay: '播放/暂停',
  navigateBack: '后退',
  navigateForward: '前进',
  toggleShuffle: '随机播放',
  cycleRepeat: '循环模式',
  playNext: '下一首',
  playPrev: '上一首',
};

const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight',
  'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight',
]);

const KEY_DISPLAY_MAP: Record<string, string> = {
  Space: '空格',
  Backspace: '退格',
  Delete: '删除',
  Enter: '回车',
  Tab: 'Tab',
  Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'",
  Backquote: '`', Backslash: '\\',
  Comma: ',', Period: '.', Slash: '/',
  Minus: '-', Equal: '=',
  Insert: 'Insert',
  Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown',
  CapsLock: 'CapsLock',
  NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadMultiply: 'Num*', NumpadDivide: 'Num/',
  NumpadEnter: 'NumEnter',
};

function formatKeyCode(code: string): string {
  if (KEY_DISPLAY_MAP[code]) return KEY_DISPLAY_MAP[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && /^\d$/.test(code.slice(6))) return 'Num' + code.slice(6);
  if (code.startsWith('F') && /^F\d{1,2}$/.test(code)) return code;
  return code;
}

function formatShortcut(shortcut: { code: string; shift: boolean; ctrl: boolean; alt: boolean }): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(formatKeyCode(shortcut.code));
  return parts.join(' + ');
}

function startRecordingShortcut(action: string, event?: MouseEvent) {
  event?.stopPropagation();
  recordingAction.value = action;
}

function handleKeydown(e: KeyboardEvent) {
  if (!recordingAction.value) return;
  e.preventDefault();
  e.stopPropagation();

  if (MODIFIER_CODES.has(e.code)) return;

  const shortcut: KeyboardShortcut = {
    code: e.code,
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
  };

  configStore.setKeyboardShortcut(recordingAction.value, shortcut);
  recordingAction.value = null;
}

function cancelRecording() {
  recordingAction.value = null;
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('click', cancelRecording);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('click', cancelRecording);
});
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-4 mb-4">
      <div>
        <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
          <Keyboard :size="20" class="text-[var(--color-primary)]" />
          键盘快捷键
        </h3>
        <p class="text-sm text-[var(--text-tertiary)]">自定义全局键盘快捷键，按下按钮后直接按键盘设置</p>
      </div>
      <button class="md3-btn-outlined text-xs" @click="configStore.resetKeyboardShortcuts">
        <RotateCcw :size="14" />
        恢复默认
      </button>
    </div>

    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
      <div v-for="(shortcut, action, index) in configStore.keyboardShortcuts" :key="action" class="flex items-center justify-between" :class="index !== Object.keys(configStore.keyboardShortcuts).length - 1 ? 'pb-4 border-b border-[var(--border-subtle)]' : ''">
        <span class="text-[var(--text-secondary)]">{{ actionLabels[action] || action }}</span>
        <button
          class="min-w-[120px] px-3 py-1.5 rounded-lg border text-sm text-center transition-all"
          :class="recordingAction === action
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] animate-pulse'
            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--color-primary)]'"
          @click="startRecordingShortcut(action, $event)"
        >
          {{ recordingAction === action ? '按下快捷键...' : formatShortcut(shortcut) }}
        </button>
      </div>
    </div>
  </div>
</template>
