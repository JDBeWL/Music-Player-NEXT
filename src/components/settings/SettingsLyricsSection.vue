<script setup lang="ts">
import { Sliders } from 'lucide-vue-next';
import { useConfigStore } from '@/stores/configStore';

const configStore = useConfigStore();
</script>

<template>
  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <Sliders :size="20" class="text-[var(--color-primary)]" />
      歌词显示
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">配置歌词显示样式和行为</p>

    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">显示模式</span>
          <span class="block text-sm text-[var(--text-tertiary)]">选择歌词显示的样式</span>
        </div>
        <div class="flex gap-2">
          <button
            class="md3-chip"
            :class="configStore.lyricsDisplayMode === 'modern' ? 'md3-chip-selected' : ''"
            @click="configStore.setLyricsDisplayMode('modern')"
          >
            现代模式
          </button>
          <button
            class="md3-chip"
            :class="configStore.lyricsDisplayMode === 'classic' ? 'md3-chip-selected' : ''"
            @click="configStore.setLyricsDisplayMode('classic')"
          >
            经典模式
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">显示翻译</span>
          <span class="block text-sm text-[var(--text-tertiary)]">显示歌词的翻译文本</span>
        </div>
        <button
          class="w-12 h-7 rounded-full transition-colors relative"
          :class="configStore.showTranslation ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'"
          role="switch"
          :aria-checked="configStore.showTranslation"
          aria-label="显示翻译"
          @click="configStore.toggleTranslation"
        >
          <span class="absolute w-5 h-5 bg-white rounded-full top-1 transition-transform" :class="configStore.showTranslation ? 'left-6' : 'left-1'"></span>
        </button>
      </div>

      <div v-if="configStore.lyricsDisplayMode === 'modern'" class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">模糊效果</span>
          <span class="block text-sm text-[var(--text-tertiary)]">非当前歌词行的模糊效果</span>
        </div>
        <button
          class="w-12 h-7 rounded-full transition-colors relative"
          :class="configStore.enableLyricsBlur ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'"
          role="switch"
          :aria-checked="configStore.enableLyricsBlur"
          aria-label="模糊效果"
          @click="configStore.toggleLyricsBlur"
        >
          <span class="absolute w-5 h-5 bg-white rounded-full top-1 transition-transform" :class="configStore.enableLyricsBlur ? 'left-6' : 'left-1'"></span>
        </button>
      </div>
    </div>
  </div>
</template>
