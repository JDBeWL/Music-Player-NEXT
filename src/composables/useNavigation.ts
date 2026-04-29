import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

export type ViewName = 'player' | 'local' | 'settings' | 'playlist-detail';

const historyStack = ref<string[]>([]);
const currentIndex = ref(-1);
const maxHistory = 50;

function getViewKey(route: ReturnType<typeof useRoute>): string {
  if (route.name === 'playlist-detail') {
    return `playlist:${route.params.id}`;
  }
  return route.name as string || 'player';
}

export function useNavigation() {
  const router = useRouter();
  const route = useRoute();

  function ensureInitialized() {
    if (currentIndex.value === -1) {
      historyStack.value = [getViewKey(route)];
      currentIndex.value = 0;
    }
  }

  const currentView = computed<ViewName>(() => {
    const name = route.name as string;
    if (name === 'playlist-detail') return 'playlist-detail';
    if (name === 'local') return 'local';
    if (name === 'settings') return 'settings';
    return 'player';
  });

  const currentPlaylistId = computed<string | null>(() => {
    if (route.name === 'playlist-detail') {
      return (route.params.id as string) ?? null;
    }
    return null;
  });

  const canGoBack = computed(() => {
    ensureInitialized();
    return currentIndex.value > 0;
  });

  const canGoForward = computed(() => {
    ensureInitialized();
    return currentIndex.value < historyStack.value.length - 1;
  });

  function updateHistory(viewKey: string) {
    ensureInitialized();

    if (viewKey === historyStack.value[currentIndex.value]) {
      return;
    }

    if (currentIndex.value < historyStack.value.length - 1) {
      historyStack.value = historyStack.value.slice(0, currentIndex.value + 1);
    }

    historyStack.value.push(viewKey);
    currentIndex.value = historyStack.value.length - 1;

    if (historyStack.value.length > maxHistory) {
      historyStack.value.shift();
      currentIndex.value--;
    }
  }

  function navigateBack() {
    if (!canGoBack.value) return;
    currentIndex.value--;
    const viewKey = historyStack.value[currentIndex.value];
    if (viewKey?.startsWith('playlist:')) {
      router.push({ name: 'playlist-detail', params: { id: viewKey.split(':')[1] } });
    } else if (viewKey) {
      router.push({ name: viewKey });
    }
  }

  function navigateForward() {
    if (!canGoForward.value) return;
    currentIndex.value++;
    const viewKey = historyStack.value[currentIndex.value];
    if (viewKey?.startsWith('playlist:')) {
      router.push({ name: 'playlist-detail', params: { id: viewKey.split(':')[1] } });
    } else if (viewKey) {
      router.push({ name: viewKey });
    }
  }

  function handleNavigate(view: string) {
    const newView = view as ViewName;
    if (newView === 'playlist-detail') return;
    const viewKey = newView;
    updateHistory(viewKey);
    router.push({ name: newView });
  }

  function openPlaylist(playlistId: string) {
    const viewKey = `playlist:${playlistId}`;
    updateHistory(viewKey);
    router.push({ name: 'playlist-detail', params: { id: playlistId } });
  }

  function closePlaylistDetail() {
    const viewKey = 'player';
    updateHistory(viewKey);
    router.push({ name: 'player' });
  }

  return {
    currentView,
    currentPlaylistId,
    canGoBack,
    canGoForward,
    navigateBack,
    navigateForward,
    handleNavigate,
    openPlaylist,
    closePlaylistDetail,
  };
}
