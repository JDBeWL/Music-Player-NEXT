import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useLibraryStore } from '@/stores/libraryStore';
import { useQueueStore } from '@/stores/queueStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { toast } from '@/services/toast';

export function useLibraryManager() {
  const libraryStore = useLibraryStore();
  const queueStore = useQueueStore();
  const playlistStore = usePlaylistStore();

  const isScanning = ref(false);

  async function addLibraryFolder() {
    try {
      const folderPath = await invoke<string | null>('open_folder_dialog');
      if (folderPath) {
        await libraryStore.addFolder(folderPath);
      }
    } catch (error) {
      console.error('Failed to add folder:', error);
      toast.error('选择文件夹失败');
    }
  }

  async function scanFolders() {
    isScanning.value = true;
    try {
      await libraryStore.scanLibraryFolders(playlistStore.playlists);
    } finally {
      isScanning.value = false;
    }
  }

  function addSelectedToQueue() {
    queueStore.addSelectedToQueue(libraryStore.selectedFilesArray);
    libraryStore.deselectAllFiles();
    libraryStore.isLocalBrowserOpen = false;
  }

  function selectFolder(folder: string) {
    libraryStore.selectFolder(folder);
  }

  function handleSelectAll() {
    libraryStore.selectAllFiles();
  }

  return {
    isScanning,
    addLibraryFolder,
    scanFolders,
    addSelectedToQueue,
    selectFolder,
    handleSelectAll,
  };
}
