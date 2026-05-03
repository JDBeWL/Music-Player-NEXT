import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { settingsSync } from '@/services/settingsSync';
import { toast } from '@/services/toast';
import type { KeyboardShortcut, AppSettings, LyricsDisplayMode, ThemeMode, CloseBehavior } from '@/types';

const DEFAULT_KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcut> = {
  togglePlay: { code: 'Space', shift: false, ctrl: false, alt: false },
  navigateBack: { code: 'ArrowLeft', shift: true, ctrl: false, alt: false },
  navigateForward: { code: 'ArrowRight', shift: true, ctrl: false, alt: false },
  toggleShuffle: { code: 'KeyS', shift: false, ctrl: false, alt: false },
  cycleRepeat: { code: 'KeyR', shift: false, ctrl: false, alt: false },
  playNext: { code: 'ArrowUp', shift: false, ctrl: true, alt: false },
  playPrev: { code: 'ArrowDown', shift: false, ctrl: true, alt: false },
};

export const useConfigStore = defineStore('config', () => {
  const lyricsDisplayMode = ref<LyricsDisplayMode>('modern');
  const showTranslation = ref(true);
  const enableLyricsBlur = ref(true);
  const themeMode = ref<ThemeMode>('dark');
  const closeBehavior = ref<CloseBehavior>('to_tray');
  const persistPlayback = ref(true);
  const neteaseRealIP = ref<string>('116.25.146.177');

  const keyboardShortcuts = ref<Record<string, KeyboardShortcut>>({ ...DEFAULT_KEYBOARD_SHORTCUTS });

  async function loadConfig() {
    try {
      const settings = await invoke<AppSettings>('get_settings');
      lyricsDisplayMode.value = settings.lyrics_display_mode || 'modern';
      showTranslation.value = settings.show_translation;
      enableLyricsBlur.value = settings.enable_lyrics_blur;
      themeMode.value = settings.theme_mode || 'dark';
      if (settings.close_behavior) {
        closeBehavior.value = settings.close_behavior || 'to_tray';
      }
      if (settings.persist_playback !== undefined) {
        persistPlayback.value = settings.persist_playback;
      }
      if (settings.netease_real_ip) {
        neteaseRealIP.value = settings.netease_real_ip;
      }
      if (settings.keyboard_shortcuts) {
        keyboardShortcuts.value = settings.keyboard_shortcuts;
      }
    } catch (error) {
      console.error('Failed to load config from Tauri:', error);
      try {
        const saved = localStorage.getItem('mpnext-config');
        if (saved) {
          const config = JSON.parse(saved);
          lyricsDisplayMode.value = config.lyricsDisplayMode || 'modern';
          showTranslation.value = config.showTranslation !== false;
          enableLyricsBlur.value = config.enableLyricsBlur !== false;
          themeMode.value = (config.themeMode as ThemeMode) || 'dark';
          if (config.keyboardShortcuts) {
            keyboardShortcuts.value = config.keyboardShortcuts;
          }
        }
      } catch (e) {
        console.error('Failed to load config from localStorage:', e);
      }
    }
    applyTheme();
  }

  async function saveConfig() {
    settingsSync.schedule({
      lyrics_display_mode: lyricsDisplayMode.value,
      show_translation: showTranslation.value,
      enable_lyrics_blur: enableLyricsBlur.value,
      theme_mode: themeMode.value,
      persist_playback: persistPlayback.value,
      netease_real_ip: neteaseRealIP.value,
      keyboard_shortcuts: keyboardShortcuts.value
    });
  }

  const setLyricsDisplayMode = async (mode: LyricsDisplayMode) => {
    lyricsDisplayMode.value = mode;
    await saveConfig();
  };

  const toggleTranslation = async () => {
    showTranslation.value = !showTranslation.value;
    await saveConfig();
  };

  const toggleLyricsBlur = async () => {
    enableLyricsBlur.value = !enableLyricsBlur.value;
    await saveConfig();
  };

  const applyTheme = () => {
    if (themeMode.value === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  const toggleTheme = async () => {
    themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
    applyTheme();
    await saveConfig();
  };

  const setThemeMode = async (mode: ThemeMode) => {
    themeMode.value = mode;
    applyTheme();
    await saveConfig();
  };

  const setKeyboardShortcut = async (action: string, shortcut: KeyboardShortcut) => {
    keyboardShortcuts.value[action] = shortcut;
    await saveConfig();
  };

  const resetKeyboardShortcuts = async () => {
    keyboardShortcuts.value = { ...DEFAULT_KEYBOARD_SHORTCUTS };
    await saveConfig();
  };

  const setCloseBehavior = async (behavior: CloseBehavior) => {
    try {
      await invoke('set_close_behavior_and_hint', {
        closeBehavior: behavior,
        firstCloseHintShown: true
      });
      closeBehavior.value = behavior;
      await saveConfig();
    } catch (error) {
      console.error('Failed to set close behavior:', error);
      toast.error('设置关闭行为失败');
    }
  };

  const setPersistPlayback = async (enabled: boolean) => {
    persistPlayback.value = enabled;
    await saveConfig();
  };

  const setNeteaseRealIP = async (ip: string) => {
    neteaseRealIP.value = ip;
    await saveConfig();
  };

  const testNeteaseConnection = async (): Promise<{ success: boolean; latency?: number; error?: string }> => {
    const ip = neteaseRealIP.value;
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://${ip}`, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);
      return { success: response.ok || response.status === 403, latency };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  return {
    lyricsDisplayMode,
    showTranslation,
    enableLyricsBlur,
    themeMode,
    closeBehavior,
    persistPlayback,
    neteaseRealIP,
    keyboardShortcuts,
    setLyricsDisplayMode,
    toggleTranslation,
    toggleLyricsBlur,
    toggleTheme,
    setThemeMode,
    setKeyboardShortcut,
    resetKeyboardShortcuts,
    setCloseBehavior,
    setPersistPlayback,
    setNeteaseRealIP,
    testNeteaseConnection,
    loadConfig,
    saveConfig
  };
});
