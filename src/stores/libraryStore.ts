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
    if (libraryTracks.value.length === 0) {
      return;
    }

    try {
      const updatedTracks = await invoke<AudioTrack[]>('extract_covers_batch', {
        tracks: libraryTracks.value
      });

      let updatedCount = 0;
      const trackMap = new Map(libraryTracks.value.map(t => [t.id, t]));
      updatedTracks.forEach(updatedTrack => {
        const track = trackMap.get(updatedTrack.id);
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
        await saveLibrary(playlists);
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

      const lrcUrl = convertFileSrc(lrcPath);
      let response = await fetch(lrcUrl);

      if (response.ok) {
        const lrcText = await response.text();
        track.lrc = lrcText;
        return lrcText;
      }

      const assPath = track.path.replace(/\.[^.]+$/, '.ass');

      const assUrl = convertFileSrc(assPath);
      response = await fetch(assUrl);

      if (response.ok) {
        const assText = await response.text();
        track.lrc = assText;
        return assText;
      }

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
      // Backend handles cover cache cleanup, search index cleanup, and library.json update
      await invoke('remove_folder', { folderPath });

      // Update frontend state - normalize paths for comparison on Windows
      const normalizedFolder = folderPath.replace(/\\/g, '/');
      libraryFolders.value = libraryFolders.value.filter(f => f.replace(/\\/g, '/') !== normalizedFolder);
      libraryTracks.value = libraryTracks.value.filter(t => !t.path.replace(/\\/g, '/').startsWith(normalizedFolder));
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
      } catch (error) {
        console.error('[LibraryStore] Failed to save scan results:', error);
      }

      if (tracksToProcess.length > 0) {
        if (modifiedFiles.length > 0) {
          const modifiedPaths = new Set(modifiedFiles.map(f => f.path));
          const oldModifiedTracks = libraryTracks.value.filter(t => modifiedPaths.has(t.path));
          if (oldModifiedTracks.length > 0) {
            try {
              const trackIds = oldModifiedTracks.map(t => t.id);
              await invoke('remove_tracks_from_index', { trackIds });
            } catch (error) {
              console.warn('[LibraryStore] Failed to remove modified tracks from index:', error);
            }
          }
        }

        try {
          await invoke('add_tracks_to_index', { tracks: parsedTracks });
        } catch (error) {
          console.warn('[LibraryStore] Failed to add tracks to index:', error);
        }

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
        return;
      }

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
