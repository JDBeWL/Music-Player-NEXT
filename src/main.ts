/**
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import { listen } from '@tauri-apps/api/event';
import App from './App.vue';
import router from './router';
import { unifiedAudioPlayer } from './services/audio/UnifiedAudioPlayer';
import { usePlaybackStore } from './stores/playbackStore';
import './styles/index.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(MotionPlugin);
app.mount('#app');

unifiedAudioPlayer.init().catch(err => {
  console.warn('[Main] Failed to pre-initialize audio player:', err);
});

const playbackStore = usePlaybackStore();

listen<{ detail: string; mode?: string | boolean }>('player-control', (event) => {
  const { detail, mode } = event.payload;
  console.log('[Main] Player control event:', detail, mode);

  switch (detail) {
    case 'toggle':
      playbackStore.togglePlay();
      break;
    case 'next':
      playbackStore.playNext();
      break;
    case 'prev':
      playbackStore.playPrev();
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
          playbackStore.setRepeatMode(mappedMode);
        }
      }
      break;
    case 'shuffle':
      playbackStore.toggleShuffle();
      break;
  }
}).catch(err => {
  console.error('[Main] Failed to listen to player-control event:', err);
});