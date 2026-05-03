<script setup lang="ts">
import SettingsLibrarySection from './SettingsLibrarySection.vue';
import SettingsLyricsSection from './SettingsLyricsSection.vue';
import SettingsAppearanceSection from './SettingsAppearanceSection.vue';
import SettingsKeyboardSection from './SettingsKeyboardSection.vue';
import SettingsAboutSection from './SettingsAboutSection.vue';
</script>

<template>
  <section class="flex-1 flex flex-col overflow-hidden" role="main" aria-label="设置">
    <div class="px-8 py-6" style="border-bottom: 1px solid var(--border-subtle);">
      <h2 class="text-3xl font-bold text-[var(--text-primary)]">设置</h2>
    </div>

    <div class="flex-1 overflow-y-auto px-8 py-6">
      <div class="max-w-3xl space-y-8">
        <SettingsLibrarySection />
        <SettingsLyricsSection />
        <SettingsAppearanceSection />
        <SettingsKeyboardSection />
        <SettingsAboutSection />
      </div>
    </div>
  </section>
</template>
