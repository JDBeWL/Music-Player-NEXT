import { onMounted, onUnmounted } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useConfigStore } from '@/stores/configStore';
import { useNavigation } from '@/composables/useNavigation';
import { usePlayerControls } from '@/composables/usePlayerControls';

export function useKeyboardShortcuts() {
  const playbackStore = usePlaybackStore();
  const configStore = useConfigStore();
  const { navigateBack, navigateForward } = useNavigation();
  const { handlePlayNext, cycleRepeatMode, toggleShuffle } = usePlayerControls();

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    for (const [action, shortcut] of Object.entries(configStore.keyboardShortcuts)) {
      if (
        e.code === shortcut.code &&
        e.shiftKey === shortcut.shift &&
        e.ctrlKey === shortcut.ctrl &&
        e.altKey === shortcut.alt
      ) {
        e.preventDefault();
        switch (action) {
          case 'togglePlay':
            playbackStore.togglePlay();
            break;
          case 'navigateBack':
            navigateBack();
            break;
          case 'navigateForward':
            navigateForward();
            break;
          case 'toggleShuffle':
            toggleShuffle();
            break;
          case 'cycleRepeat':
            cycleRepeatMode();
            break;
          case 'playNext':
            handlePlayNext();
            break;
          case 'playPrev':
            playbackStore.playPrev();
            break;
        }
        return;
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeydown);
  });
}
