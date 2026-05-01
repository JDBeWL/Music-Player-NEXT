import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { settingsSync } from '@/services/settingsSync';

export const useConfigStore = defineStore('config', () => {
  const lyricsDisplayMode = ref<'modern' | 'classic'>('modern');
  const showTranslation = ref(true);
  const enableLyricsBlur = ref(true);
  const themeMode = ref<'dark' | 'light'>('dark');
  const closeBehavior = ref<'to_tray' | 'quit'>('to_tray');
  const persistPlayback = ref(true);
  const neteaseRealIP = ref<string>('116.25.146.177');

  interface KeyboardShortcut {
    code: string;
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  }

  const keyboardShortcuts = ref<Record<string, KeyboardShortcut>>({
    togglePlay: { code: 'Space', shift: false, ctrl: false, alt: false },
    navigateBack: { code: 'ArrowLeft', shift: true, ctrl: false, alt: false },
    navigateForward: { code: 'ArrowRight', shift: true, ctrl: false, alt: false },
    toggleShuffle: { code: 'KeyS', shift: false, ctrl: false, alt: false },
    cycleRepeat: { code: 'KeyR', shift: false, ctrl: false, alt: false },
    playNext: { code: 'ArrowUp', shift: false, ctrl: true, alt: false },
    playPrev: { code: 'ArrowDown', shift: false, ctrl: true, alt: false },
  });

  interface AppSettings {
    volume: number;
    lyrics_display_mode: string;
    show_translation: boolean;
    enable_lyrics_blur: boolean;
    theme_mode: string;
    close_behavior?: string;
    persist_playback?: boolean;
    netease_real_ip?: string;
  }

  async function loadConfig() {
    try {
      const settings = await invoke<AppSettings>('get_settings');
      lyricsDisplayMode.value = (settings.lyrics_display_mode as 'modern' | 'classic') || 'modern';
      showTranslation.value = settings.show_translation;
      enableLyricsBlur.value = settings.enable_lyrics_blur;
      themeMode.value = (settings.theme_mode as 'dark' | 'light') || 'dark';
      if (settings.close_behavior) {
        closeBehavior.value = (settings.close_behavior as 'to_tray' | 'quit') || 'to_tray';
      }
      if (settings.persist_playback !== undefined) {
        persistPlayback.value = settings.persist_playback;
      }
      if (settings.netease_real_ip) {
        neteaseRealIP.value = settings.netease_real_ip;
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
          themeMode.value = (config.themeMode as 'dark' | 'light') || 'dark';
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
      netease_real_ip: neteaseRealIP.value
    });
  }

  const setLyricsDisplayMode = async (mode: 'modern' | 'classic') => {
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

  const setThemeMode = async (mode: 'dark' | 'light') => {
    themeMode.value = mode;
    applyTheme();
    await saveConfig();
  };

  const setKeyboardShortcut = async (action: string, shortcut: KeyboardShortcut) => {
    keyboardShortcuts.value[action] = shortcut;
    await saveConfig();
  };

  const setCloseBehavior = async (behavior: 'to_tray' | 'quit') => {
    try {
      await invoke('set_close_behavior_and_hint', {
        closeBehavior: behavior,
        firstCloseHintShown: true
      });
      closeBehavior.value = behavior;
    } catch (error) {
      console.error('Failed to set close behavior:', error);
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
    setCloseBehavior,
    setPersistPlayback,
    setNeteaseRealIP,
    loadConfig,
    saveConfig
  };
});
