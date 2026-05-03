/**
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import App from './App.vue';
import router from './router';
import { unifiedAudioPlayer } from './services/audio/UnifiedAudioPlayer';
import { useQueueStore } from './stores/queueStore';
import { toast } from './services/toast';
import './styles/index.css';

const app = createApp(App);
const pinia = createPinia();

app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', info, err);
  const message = err instanceof Error ? err.message : String(err);
  toast.error(`应用错误：${message}`);
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise]', event.reason);
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  toast.error(`未处理的错误：${message}`);
});

app.use(pinia);
app.use(router);
app.mount('#app');

unifiedAudioPlayer.init().catch(err => {
  console.warn('[Main] Failed to pre-initialize audio player:', err);
});

const queueStore = useQueueStore();

let playerControlUnlisten: UnlistenFn | null = null;

listen<{ detail: string; mode?: string | boolean }>('player-control', (event) => {
  const { detail, mode } = event.payload;
  console.log('[Main] Player control event:', detail, mode);

  switch (detail) {
    case 'toggle':
      queueStore.togglePlay();
      break;
    case 'next':
      queueStore.playNext();
      break;
    case 'prev':
      queueStore.playPrev();
      break;
    case 'loop':
      if (typeof mode === 'string') {
        const modeMap: Record<string, 'none' | 'one' | 'all'> = {
          'off': 'none',
          'track': 'one',
          'playlist': 'all'
        };
        const mappedMode = modeMap[mode];
        if (mappedMode) {
          queueStore.setRepeatMode(mappedMode);
        }
      }
      break;
    case 'shuffle':
      queueStore.toggleShuffle();
      break;
  }
}).then(unlistenFn => {
  playerControlUnlisten = unlistenFn;
}).catch(err => {
  console.error('[Main] Failed to listen to player-control event:', err);
});

window.addEventListener('beforeunload', () => {
  if (playerControlUnlisten) {
    playerControlUnlisten();
    playerControlUnlisten = null;
  }
});