import { defineStore } from 'pinia';
import { ref, reactive, computed, shallowRef, triggerRef } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AudioTrack, ScanProgress, FileInfo, Playlist } from '@/types';
import { normalizePath } from '@/utils/format';
import { toast } from '@/services/toast';
import { saveLibraryToBackend, loadLibraryFromBackend } from '@/services/persistence/libraryPersistence';

export const useLibraryStore = defineStore('library', () => {
  const libraryFolders = ref<string[]>([]);
  const libraryTracks = shallowRef<AudioTrack[]>([]);
  const scanDepth = ref(3);
  const scanProgress = ref<ScanProgress | null>(null);

  const localFiles = ref<AudioTrack[]>([]);
  const selectedFileIds = reactive<Set<string>>(new Set());
  const isLocalBrowserOpen = ref(false);

  const selectedFilesArray = computed(() => {
    return libraryTracks.value.filter(f => selectedFileIds.has(f.id));
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

  function updateTrackCover(trackId: string, coverUrl?: string, coverId?: string): void {
    const track = libraryTracks.value.find(t => t.id === trackId);
    if (!track) return;
    let changed = false;
    if (coverUrl && track.coverUrl !== coverUrl) {
      track.coverUrl = coverUrl;
      changed = true;
    }
    if (coverId && track.coverId !== coverId) {
      track.coverId = coverId;
      changed = true;
    }
    if (changed) {
      triggerRef(libraryTracks);
    }
  }

  async function preloadAllCovers(playlists: Playlist[]) {
    if (libraryTracks.value.length === 0) {
      return;
    }

    try {
      const BATCH_SIZE = 50;
      const allTracks = libraryTracks.value;
      let totalUpdated = 0;

      for (let i = 0; i < allTracks.length; i += BATCH_SIZE) {
        const batch = allTracks.slice(i, i + BATCH_SIZE);
        const updatedTracks = await invoke<AudioTrack[]>('extract_covers_batch', {
          tracks: batch
        });

        let batchUpdated = 0;
        updatedTracks.forEach(updatedTrack => {
          const hadChanges = (updatedTrack.coverUrl || updatedTrack.coverId);
          updateTrackCover(updatedTrack.id, updatedTrack.coverUrl, updatedTrack.coverId);
          if (hadChanges) batchUpdated++;
        });
        totalUpdated += batchUpdated;

        if (i + BATCH_SIZE < allTracks.length) {
          await new Promise<void>(resolve => {
            const scheduleIdle = (window as any).requestIdleCallback
              ? (window as any).requestIdleCallback
              : (cb: () => void) => setTimeout(cb, 0);
            scheduleIdle(() => resolve());
          });
        }
      }

      if (totalUpdated > 0) {
        await saveLibrary(playlists);
      }
    } catch (error) {
      console.warn('[LibraryStore] Failed to preload covers:', error);
    }
  }

  function cacheLyrics(trackId: string, lrcText: string): void {
    const track = libraryTracks.value.find(t => t.id === trackId);
    if (track) {
      track.lrc = lrcText;
      triggerRef(libraryTracks);
    }
  }

  async function loadLyrics(track: AudioTrack): Promise<string | undefined> {
    try {
      if (track.lrc) {
        return track.lrc;
      }

      const assPath = track.path.replace(/\.[^.]+$/, '.ass');
      const assUrl = convertFileSrc(assPath);
      let response = await fetch(assUrl);

      if (response.ok) {
        const assText = await response.text();
        cacheLyrics(track.id, assText);
        return assText;
      }

      const lrcPath = track.path.replace(/\.[^.]+$/, '.lrc');
      const lrcUrl = convertFileSrc(lrcPath);
      response = await fetch(lrcUrl);

      if (response.ok) {
        const lrcText = await response.text();
        cacheLyrics(track.id, lrcText);
        return lrcText;
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
      toast.error('保存音乐库失败');
    }
  }

  async function persistLibrary(playlists: Playlist[]) {
    await saveLibrary(playlists);
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
      toast.error('加载音乐库失败');
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
      toast.error('添加文件夹失败');
    }
  }

  async function removeFolder(folderPath: string) {
    try {
      // Backend handles cover cache cleanup, search index cleanup, and library.json update
      await invoke('remove_folder', { folderPath });

      // Update frontend state - normalize paths for comparison on Windows
      const normalizedFolder = normalizePath(folderPath);
      libraryFolders.value = libraryFolders.value.filter(f => normalizePath(f) !== normalizedFolder);
      libraryTracks.value = libraryTracks.value.filter(t => !normalizePath(t.path).startsWith(normalizedFolder));
    } catch (error) {
      console.error('[LibraryStore] Failed to remove folder:', error);
      toast.error('移除文件夹失败');
    }
  }

  async function validateExistingFolders(): Promise<string[]> {
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

    return existingFolders;
  }

  interface ScanDelta {
    removedTracks: AudioTrack[];
    newFiles: FileInfo[];
    modifiedFiles: FileInfo[];
    tracksToProcess: FileInfo[];
    existingPaths: Set<string>;
  }

  async function computeScanDelta(existingFolders: string[]): Promise<ScanDelta> {
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

    return { removedTracks, newFiles, modifiedFiles, tracksToProcess, existingPaths };
  }

  async function processNewAndModifiedTracks(tracksToProcess: FileInfo[]): Promise<AudioTrack[]> {
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

    return parsedTracks;
  }

  async function updateSearchIndex(
    removedTracks: AudioTrack[],
    modifiedFiles: FileInfo[],
    parsedTracks: AudioTrack[],
    playlists: Playlist[]
  ): Promise<void> {
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

    if (parsedTracks.length > 0 || modifiedFiles.length > 0) {
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
  }

  async function scanLibraryFolders(playlists: Playlist[]) {
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<ScanProgress>('scan-progress', (event) => {
        scanProgress.value = event.payload;
      });

      const existingFolders = await validateExistingFolders();

      const { removedTracks, modifiedFiles, tracksToProcess, existingPaths } = await computeScanDelta(existingFolders);

      const parsedTracks = await processNewAndModifiedTracks(tracksToProcess);

      const modifiedPaths = new Set(modifiedFiles.map(f => f.path));
      const newTracks = libraryTracks.value.filter(t => !modifiedPaths.has(t.path) && existingPaths.has(t.path));

      const finalTracks = [...newTracks, ...parsedTracks];
      finalTracks.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));

      libraryTracks.value = finalTracks;

      try {
        await saveLibrary(playlists);
      } catch (error) {
        console.error('[LibraryStore] Failed to save scan results:', error);
        toast.error('保存扫描结果失败');
      }

      await updateSearchIndex(removedTracks, modifiedFiles, parsedTracks, playlists);
    } catch (error) {
      console.error('[LibraryStore] Failed to scan library folders:', error);
      toast.error('扫描音乐库失败');
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
      selectedFileIds.clear();

      const tracks = await invoke<AudioTrack[]>('scan_folder', { folderPath });
      localFiles.value = tracks;
    } catch (error) {
      console.error('[LibraryStore] Failed to open folder:', error);
      toast.error('打开文件夹失败');
    }
  }

  function toggleFileSelection(fileId: string) {
    if (selectedFileIds.has(fileId)) {
      selectedFileIds.delete(fileId);
    } else {
      selectedFileIds.add(fileId);
    }
  }

  function selectAllFiles(trackIds?: string[]) {
    selectedFileIds.clear();
    (trackIds ?? libraryTracks.value.map(f => f.id)).forEach(id => selectedFileIds.add(id));
  }

  function deselectAllFiles() {
    selectedFileIds.clear();
  }

  function selectFolder(folder: string) {
    const folderTracks = tracksByFolder.value.get(folder);
    if (!folderTracks) return;

    folderTracks.forEach(track => {
      selectedFileIds.add(track.id);
    });
  }

  function closeLocalBrowser() {
    isLocalBrowserOpen.value = false;
    deselectAllFiles();
  }

  function clearAllCoverReferences() {
    libraryTracks.value.forEach(track => {
      track.coverUrl = undefined;
      track.coverId = undefined;
    });
    triggerRef(libraryTracks);
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
    persistLibrary,
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
    clearAllCoverReferences,
    preloadAllCovers,
    loadLyrics,
    cacheLyrics,
    updateTrackCover,
  };
});
