<script setup lang="ts">
import { Palette, Sliders } from 'lucide-vue-next';
import { useConfigStore } from '@/stores/configStore';

const configStore = useConfigStore();
</script>

<template>
  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <Palette :size="20" class="text-[var(--color-primary)]" />
      外观
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">配置应用的外观和主题</p>

    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">主题模式</span>
          <span class="block text-sm text-[var(--text-tertiary)]">选择应用的显示主题</span>
        </div>
        <div class="flex gap-2">
          <button
            class="md3-chip"
            :class="configStore.themeMode === 'dark' ? 'md3-chip-selected' : ''"
            @click="configStore.setThemeMode('dark')"
          >
            暗色模式
          </button>
          <button
            class="md3-chip"
            :class="configStore.themeMode === 'light' ? 'md3-chip-selected' : ''"
            @click="configStore.setThemeMode('light')"
          >
            亮色模式
          </button>
        </div>
      </div>
    </div>
  </div>

  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <Sliders :size="20" class="text-[var(--color-primary)]" />
      窗口行为
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">配置关闭窗口时的行为</p>

    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">关闭按钮行为</span>
          <span class="block text-sm text-[var(--text-tertiary)]">选择点击关闭按钮时的行为</span>
        </div>
        <div class="flex gap-2">
          <button
            class="md3-chip"
            :class="configStore.closeBehavior === 'to_tray' ? 'md3-chip-selected' : ''"
            @click="configStore.setCloseBehavior('to_tray')"
          >
            最小化到托盘
          </button>
          <button
            class="md3-chip"
            :class="configStore.closeBehavior === 'quit' ? 'md3-chip-selected' : ''"
            @click="configStore.setCloseBehavior('quit')"
          >
            直接退出
          </button>
        </div>
      </div>

      <div class="border-t border-[var(--border-subtle)]"></div>

      <div class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">记住播放状态</span>
          <span class="block text-sm text-[var(--text-tertiary)]">重新打开时恢复上次的播放进度</span>
        </div>
        <button
          class="w-12 h-7 rounded-full transition-colors relative"
          :class="configStore.persistPlayback ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'"
          role="switch"
          :aria-checked="configStore.persistPlayback"
          aria-label="记住播放状态"
          @click="configStore.setPersistPlayback(!configStore.persistPlayback)"
        >
          <span class="absolute w-5 h-5 bg-white rounded-full top-1 transition-transform" :class="configStore.persistPlayback ? 'left-6' : 'left-1'"></span>
        </button>
      </div>
    </div>
  </div>
</template>
