import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AudioTrack, ScanProgress, FileInfo, Playlist } from '@/types';
import { saveLibraryToBackend, loadLibraryFromBackend } from '@/services/persistence/libraryPersistence';

export const useLibraryStore = defineStore('library', () => {
  const libraryFolders = ref<string[]>([]);
  const libraryTracks = ref<AudioTrack[]>([]);
  const scanDepth = ref(3);
  const scanProgress = ref<ScanProgress | null>(null);

  const localFiles = ref<AudioTrack[]>([]);
  const selectedFileIds = ref<Set<string>>(new Set());
  const isLocalBrowserOpen = ref(false);

  const selectedFilesArray = computed(() => {
    return libraryTracks.value.filter(f => selectedFileIds.value.has(f.id));
  });

  const tracksByFolder = computed(() => {
    const grouped = new Map<string, AudioTrack[]>();
    libraryTracks.value.forEach(track => {
      const pathParts = track.path.split(/[/\\]/);
      pathParts.pop();
      const folder = pathParts.join('/');

      if (!grouped.has(folder)) {
        grouped.set(folder, []);
      }
      grouped.get(folder)!.push(track);
    });
    return grouped;
  });

  async function preloadAllCovers(playlists: Playlist[]) {
    console.log('[LibraryStore] Starting to preload covers for', libraryTracks.value.length, 'tracks');

    if (libraryTracks.value.length === 0) {
      console.log('[LibraryStore] No tracks in library to preload covers');
      return;
    }

    try {
      const updatedTracks = await invoke<AudioTrack[]>('extract_covers_batch', {
        tracks: libraryTracks.value
      });

      console.log('[LibraryStore] Backend processed covers for', updatedTracks.length, 'tracks');

      let updatedCount = 0;
      updatedTracks.forEach(updatedTrack => {
        const track = libraryTracks.value.find(t => t.id === updatedTrack.id);
        if (track) {
          if (updatedTrack.coverUrl && track.coverUrl !== updatedTrack.coverUrl) {
            track.coverUrl = updatedTrack.coverUrl;
            updatedCount++;
          }
          if (updatedTrack.coverId && track.coverId !== updatedTrack.coverId) {
            track.coverId = updatedTrack.coverId;
            updatedCount++;
          }
        }
      });

      if (updatedCount > 0) {
        console.log(`[LibraryStore] Updated cover info for ${updatedCount} tracks`);
        await saveLibrary(playlists);
        console.log('[LibraryStore] All covers preloaded and saved');
      } else {
        console.log('[LibraryStore] No cover info needed update');
      }
    } catch (error) {
      console.error('[LibraryStore] Failed to preload covers:', error);
    }
  }

  async function loadLyrics(track: AudioTrack): Promise<string | undefined> {
    try {
      if (track.lrc) {
        return track.lrc;
      }

      const lrcPath = track.path.replace(/\.[^.]+$/, '.lrc');
      console.log('[LibraryStore] Trying to load LRC lyrics from:', lrcPath);

      const lrcUrl = convertFileSrc(lrcPath);
      let response = await fetch(lrcUrl);

      if (response.ok) {
        const lrcText = await response.text();
        console.log('[LibraryStore] LRC lyrics loaded, length:', lrcText.length);
        track.lrc = lrcText;
        return lrcText;
      }

      const assPath = track.path.replace(/\.[^.]+$/, '.ass');
      console.log('[LibraryStore] LRC not found, trying to load ASS lyrics from:', assPath);

      const assUrl = convertFileSrc(assPath);
      response = await fetch(assUrl);

      if (response.ok) {
        const assText = await response.text();
        console.log('[LibraryStore] ASS lyrics loaded, length:', assText.length);
        track.lrc = assText;
        return assText;
      }

      console.log('[LibraryStore] No lyrics file found (tried .lrc and .ass)');
      return undefined;
    } catch (error) {
      console.warn('[LibraryStore] Failed to load lyrics:', error);
      return undefined;
    }
  }

  async function saveLibrary(playlists: Playlist[]) {
    try {
      await saveLibraryToBackend(
        libraryFolders.value,
        playlists,
        libraryTracks.value,
        scanDepth.value
      );
    } catch (error) {
      console.error('[LibraryStore] Failed to save library:', error);
    }
  }

  async function loadLibrary(): Promise<Playlist[]> {
    try {
      const { folders, tracks, scanDepth: depth, playlists } = await loadLibraryFromBackend();
      libraryFolders.value = folders;
      libraryTracks.value = tracks;
      if (depth != null) {
        scanDepth.value = depth;
      }
      return playlists || [];
    } catch (error) {
      console.error('[LibraryStore] Failed to load library:', error);
      return [];
    }
  }

  async function addFolder(folderPath: string) {
    try {
      await invoke('add_folder', { folderPath });
      if (!libraryFolders.value.includes(folderPath)) {
        libraryFolders.value.push(folderPath);
      }
    } catch (error) {
      console.error('[LibraryStore] Failed to add folder:', error);
    }
  }

  async function removeFolder(folderPath: string) {
    try {
      await invoke('remove_folder', { folderPath });

      // 获取要删除的曲目，以便清理封面缓存
      const tracksToRemove = libraryTracks.value.filter(t => t.path.startsWith(folderPath));

      libraryFolders.value = libraryFolders.value.filter(f => f !== folderPath);
      libraryTracks.value = libraryTracks.value.filter(t => !t.path.startsWith(folderPath));

      // 删除对应曲目的封面缓存
      for (const track of tracksToRemove) {
        if (track.coverId) {
          try {
            await invoke('remove_cover', { coverId: track.coverId });
          } catch (error) {
            console.warn(`[LibraryStore] Failed to remove cover: ${track.coverId}`, error);
          }
        }
      }

      // 从搜索索引中移除
      if (tracksToRemove.length > 0) {
        try {
          const trackIds = tracksToRemove.map(t => t.id);
          await invoke('remove_tracks_from_index', { trackIds });
        } catch (error) {
          console.warn('[LibraryStore] Failed to remove tracks from index:', error);
        }
      }

      console.log(`[LibraryStore] Removed folder ${folderPath} and ${tracksToRemove.length} tracks`);
    } catch (error) {
      console.error('[LibraryStore] Failed to remove folder:', error);
    }
  }

  async function scanLibraryFolders(playlists: Playlist[]) {
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<ScanProgress>('scan-progress', (event) => {
        scanProgress.value = event.payload;
      });

      const existingFolders: string[] = [];
      for (const folder of libraryFolders.value) {
        try {
          await invoke('read_dir', { path: folder });
          existingFolders.push(folder);
        } catch (error) {
          console.warn(`[LibraryStore] Folder not found or inaccessible: ${folder}`);
        }
      }

      if (existingFolders.length !== libraryFolders.value.length) {
        console.log(`[LibraryStore] Removed ${libraryFolders.value.length - existingFolders.length} invalid folders`);
        libraryFolders.value = existingFolders;
      }

      const existingTrackMap = new Map<string, AudioTrack>();
      libraryTracks.value.forEach(track => {
        existingTrackMap.set(track.path, track);
      });

      const allFiles: FileInfo[] = [];
      for (const folder of existingFolders) {
        const files = await invoke<FileInfo[]>('get_files_with_mtime', {
          folderPath: folder,
          maxDepth: scanDepth.value
        });
        allFiles.push(...files);
      }

      const existingPaths = new Set(libraryTracks.value.map(t => t.path));
      const currentPaths = new Set(allFiles.map(f => f.path));

      const removedTracks = libraryTracks.value.filter(t => !currentPaths.has(t.path));
      const newFiles = allFiles.filter(f => !existingPaths.has(f.path));
      const modifiedFiles = allFiles.filter(f => {
        const existing = existingTrackMap.get(f.path);
        return existing && existing.fileMtime !== f.mtime;
      });

      const tracksToProcess = [...newFiles, ...modifiedFiles];
      const unchangedCount = allFiles.length - tracksToProcess.length;
      const removedCount = removedTracks.length;

      console.log(`[LibraryStore] Incremental scan: ${unchangedCount} unchanged, ${tracksToProcess.length} to process, ${removedCount} removed`);

      const parsedTracks: AudioTrack[] = [];
      const batchSize = 5;

      for (let i = 0; i < tracksToProcess.length; i += batchSize) {
        const batch = tracksToProcess.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex + 1;

            if (globalIndex % 10 === 0 || globalIndex === tracksToProcess.length) {
              scanProgress.value = {
                current: globalIndex,
                total: tracksToProcess.length,
                current_file: file.path.split(/[/\\]/).pop() || '',
                phase: 'scanning'
              };
            }

            try {
              const track = await invoke<AudioTrack>('parse_audio_metadata', { path: file.path });
              track.fileMtime = file.mtime;
              return track;
            } catch (error) {
              console.warn(`[LibraryStore] Failed to parse metadata for ${file.path}:`, error);
              return null;
            }
          })
        );

        parsedTracks.push(...batchResults.filter((track): track is AudioTrack => track !== null));
      }

      const modifiedPaths = new Set(modifiedFiles.map(f => f.path));
      const newTracks = libraryTracks.value.filter(t => !modifiedPaths.has(t.path) && existingPaths.has(t.path));

      const finalTracks = [...newTracks, ...parsedTracks];
      finalTracks.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));

      if (removedTracks.length > 0) {
        console.log(`[LibraryStore] Removing ${removedTracks.length} tracks from index and cache`);

        try {
          const trackIds = removedTracks.map(t => t.id);
          await invoke('remove_tracks_from_index', { trackIds });
        } catch (error) {
          console.warn('[LibraryStore] Failed to remove tracks from index:', error);
        }

        for (const track of removedTracks) {
          if (track.coverId) {
            try {
              await invoke('remove_cover', { coverId: track.coverId });
            } catch (error) {
              console.warn(`[LibraryStore] Failed to remove cover: ${track.coverId}`, error);
            }
          }
        }
      }

      libraryTracks.value = finalTracks;

      // 保存扫描结果到后端
      try {
        await saveLibrary(playlists);
        console.log('[LibraryStore] Scan results saved to backend');
      } catch (error) {
        console.error('[LibraryStore] Failed to save scan results:', error);
      }

      if (tracksToProcess.length > 0) {
        try {
          await invoke('add_tracks_to_index', { tracks: parsedTracks });
        } catch (error) {
          console.warn('[LibraryStore] Failed to add tracks to index:', error);
        }

        console.log('[LibraryStore] Scan complete, starting cover preload...');
        await preloadAllCovers(playlists);
      }
    } catch (error) {
      console.error('[LibraryStore] Failed to scan library folders:', error);
    } finally {
      if (unlisten) {
        unlisten();
      }
      scanProgress.value = null;
    }
  }

  async function setScanDepth(depth: number) {
    scanDepth.value = Math.max(1, Math.min(10, depth));
  }

  async function browseFolder() {
    try {
      const folderPath = await invoke<string | null>('open_folder_dialog');

      if (!folderPath) {
        console.log('[LibraryStore] No folder selected');
        return;
      }

      console.log('[LibraryStore] Folder selected:', folderPath);
      isLocalBrowserOpen.value = true;
      localFiles.value = [];
      selectedFileIds.value.clear();

      const tracks = await invoke<AudioTrack[]>('scan_folder', { folderPath });
      localFiles.value = tracks;
    } catch (error) {
      console.error('[LibraryStore] Failed to open folder:', error);
    }
  }

  function toggleFileSelection(fileId: string) {
    if (selectedFileIds.value.has(fileId)) {
      selectedFileIds.value.delete(fileId);
    } else {
      selectedFileIds.value.add(fileId);
    }
    selectedFileIds.value = new Set(selectedFileIds.value);
  }

  function selectAllFiles() {
    selectedFileIds.value = new Set(libraryTracks.value.map(f => f.id));
  }

  function deselectAllFiles() {
    selectedFileIds.value.clear();
    selectedFileIds.value = new Set();
  }

  function selectFolder(folder: string) {
    const folderTracks = tracksByFolder.value.get(folder);
    if (!folderTracks) return;

    folderTracks.forEach(track => {
      selectedFileIds.value.add(track.id);
    });
    selectedFileIds.value = new Set(selectedFileIds.value);
  }

  function closeLocalBrowser() {
    isLocalBrowserOpen.value = false;
    deselectAllFiles();
  }

  return {
    libraryFolders,
    libraryTracks,
    scanDepth,
    scanProgress,
    localFiles,
    selectedFileIds,
    selectedFilesArray,
    isLocalBrowserOpen,
    tracksByFolder,
    loadLibrary,
    saveLibrary,
    addFolder,
    removeFolder,
    scanLibraryFolders,
    setScanDepth,
    browseFolder,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    selectFolder,
    closeLocalBrowser,
    preloadAllCovers,
    loadLyrics,
  };
});
