import { onMounted, onUnmounted } from 'vue';
import { useQueueStore } from '@/stores/queueStore';
import { useConfigStore } from '@/stores/configStore';
import { useNavigation } from '@/composables/useNavigation';

export function useKeyboardShortcuts() {
  const queueStore = useQueueStore();
  const configStore = useConfigStore();
  const { navigateBack, navigateForward } = useNavigation();

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
            queueStore.togglePlay();
            break;
          case 'navigateBack':
            navigateBack();
            break;
          case 'navigateForward':
            navigateForward();
            break;
          case 'toggleShuffle':
            queueStore.toggleShuffle();
            break;
          case 'cycleRepeat':
            queueStore.cycleRepeatMode();
            break;
          case 'playNext':
            queueStore.playNext();
            break;
          case 'playPrev':
            queueStore.playPrev();
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
