import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export function getCoverUrl(coverUrl: string | null | undefined): string | undefined {
  if (!coverUrl) return undefined;
  if (coverUrl.startsWith('data:')) return coverUrl;
  return convertFileSrc(coverUrl);
}
import { unifiedAudioPlayer } from '@/services/audio/UnifiedAudioPlayer';

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl?: string; // 封面图片 URL
  coverId?: string; // 封面 ID
  lrc?: string; // LRC 歌词文本
  fileMtime?: number;
}

export interface FileInfo {
  path: string;
  mtime: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: AudioTrack[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MusicLibrary {
  folders: string[];
  playlists: Playlist[];
  tracks: AudioTrack[];
  scanDepth?: number;
}

export interface ScanProgress {
  current: number;
  total: number;
  current_file: string;
  phase: string;
}

interface RustPlaylist {
  id: string;
  name: string;
  track_ids: string[];
  created_at: number;
  updated_at: number;
}

interface RustLibrary {
  folders: string[];
  playlists: RustPlaylist[];
  tracks: AudioTrack[];
  scan_depth?: number;
}

const FAVORITE_PLAYLIST_ID = 'favorite_playlist';

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref<AudioTrack | null>(null);
  const queue = ref<AudioTrack[]>([]);
  const currentIndex = ref(-1);
  const playbackState = ref<PlaybackState>('idle');
  const volume = ref(0.7);
  const currentTime = ref(0);
  const duration = ref(0);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);

  const playlists = ref<Playlist[]>([]);
  const currentPlaylistId = ref<string | null>(null);

  const libraryFolders = ref<string[]>([]);
  const libraryTracks = ref<AudioTrack[]>([]);
  const scanDepth = ref(3); // 默认扫描深度为 3
  const scanProgress = ref<ScanProgress | null>(null);

  const localFiles = ref<AudioTrack[]>([]);
  const selectedFileIds = ref<Set<string>>(new Set());
  const isLocalBrowserOpen = ref(false);

  const isShuffle = ref(false);
  const repeatMode = ref<'none' | 'one' | 'all'>('none');

  // 歌词相关
  const lyricsOffset = ref(0); // 歌词偏移（秒）
  const currentLyricIndex = ref(-1); // 当前歌词索引

  const isPlaying = computed(() => playbackState.value === 'playing');
  const isPaused = computed(() => playbackState.value === 'paused');
  const hasTrack = computed(() => currentTrack.value !== null);
  const currentCoverUrl = computed(() => {
    const cover = currentTrack.value?.coverUrl;
    if (!cover) return undefined;
    if (cover.startsWith('data:')) return cover;
    return convertFileSrc(cover);
  });

  const progress = computed(() => {
    if (duration.value === 0) return 0;
    return (currentTime.value / duration.value) * 100;
  });

  const currentPlaylist = computed(() => {
    return playlists.value.find(p => p.id === currentPlaylistId.value) || null;
  });

  const selectedFilesArray = computed(() => {
    return libraryTracks.value.filter(f => selectedFileIds.value.has(f.id));
  });

  // 按文件夹分组音乐
  const tracksByFolder = computed(() => {
    const grouped = new Map<string, AudioTrack[]>();
    libraryTracks.value.forEach(track => {
      // 获取文件所在的文件夹路径
      const pathParts = track.path.split(/[/\\]/);
      pathParts.pop(); // 移除文件名
      const folder = pathParts.join('/');

      if (!grouped.has(folder)) {
        grouped.set(folder, []);
      }
      grouped.get(folder)!.push(track);
    });
    return grouped;
  });

  // 批量预加载封面（使用后端）
  async function preloadAllCovers() {
    console.log('[Store] Starting to preload covers for', libraryTracks.value.length, 'tracks');

    if (libraryTracks.value.length === 0) {
      console.log('[Store] No tracks in library to preload covers');
      return;
    }

    try {
      // 调用后端批量提取封面，后端现在会检查文件是否存在
      const updatedTracks = await invoke<AudioTrack[]>('extract_covers_batch', {
        tracks: libraryTracks.value
      });

      console.log('[Store] Backend processed covers for', updatedTracks.length, 'tracks');

      let updatedCount = 0;
      // 更新 libraryTracks 中的封面信息
      updatedTracks.forEach(updatedTrack => {
        const track = libraryTracks.value.find(t => t.id === updatedTrack.id);
        if (track && updatedTrack.coverUrl && track.coverUrl !== updatedTrack.coverUrl) {
          track.coverUrl = updatedTrack.coverUrl;
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        console.log(`[Store] Updated cover info for ${updatedCount} tracks`);
        // 保存更新后的库
        await saveLibrary();
        console.log('[Store] All covers preloaded and saved');
      } else {
        console.log('[Store] No cover info needed update');
      }
    } catch (error) {
      console.error('[Store] Failed to preload covers:', error);
    }
  }

  // 读取歌词文件（支持 LRC 和 ASS 格式）
  async function loadLyrics(track: AudioTrack): Promise<string | undefined> {
    try {
      // 如果已经有歌词，直接返回
      if (track.lrc) {
        return track.lrc;
      }

      // 尝试加载 LRC 文件
      const lrcPath = track.path.replace(/\.[^.]+$/, '.lrc');
      console.log('[Store] Trying to load LRC lyrics from:', lrcPath);

      const lrcUrl = convertFileSrc(lrcPath);
      let response = await fetch(lrcUrl);

      if (response.ok) {
        const lrcText = await response.text();
        console.log('[Store] LRC lyrics loaded, length:', lrcText.length);
        track.lrc = lrcText; // 缓存到 track 对象
        return lrcText;
      }

      // 如果 LRC 不存在，尝试加载 ASS 文件
      const assPath = track.path.replace(/\.[^.]+$/, '.ass');
      console.log('[Store] LRC not found, trying to load ASS lyrics from:', assPath);

      const assUrl = convertFileSrc(assPath);
      response = await fetch(assUrl);

      if (response.ok) {
        const assText = await response.text();
        console.log('[Store] ASS lyrics loaded, length:', assText.length);
        track.lrc = assText; // 缓存到 track 对象
        return assText;
      }

      console.log('[Store] No lyrics file found (tried .lrc and .ass)');
      return undefined;
    } catch (error) {
      console.warn('[Store] Failed to load lyrics:', error);
      return undefined;
    }
  }

  // 确保"我喜欢的音乐"播放列表存在
  function ensureFavoritePlaylist() {
    const existing = playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID);
    if (!existing) {
      const favoritePlaylist: Playlist = {
        id: FAVORITE_PLAYLIST_ID,
        name: '我喜欢的音乐',
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      playlists.value.unshift(favoritePlaylist);
    }
  }

  async function loadLibrary() {
    try {
      const lib = await invoke<RustLibrary>('get_library');
      libraryFolders.value = lib.folders || [];
      if (lib.scan_depth != null) {
        scanDepth.value = lib.scan_depth;
      }

      playlists.value = (lib.playlists || []).map(p => ({
        id: p.id,
        name: p.name,
        tracks: p.track_ids
          .map(tid => lib.tracks.find(t => t.id === tid))
          .filter((t): t is AudioTrack => t !== undefined),
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }));

      libraryTracks.value = lib.tracks || [];

      // 确保"我喜欢的音乐"播放列表存在
      ensureFavoritePlaylist();
    } catch (error) {
      console.error('[Store] Failed to load library:', error);
    }
  }

  async function saveLibrary() {
    try {
      const rustPlaylists: RustPlaylist[] = playlists.value.map(p => ({
        id: p.id,
        name: p.name,
        track_ids: p.tracks.map(t => t.id),
        created_at: p.createdAt,
        updated_at: p.updatedAt
      }));

      // 使用 Map 来按路径去重，优先保留播放列表中的曲目（因为它们有正确的 ID）
      const trackMap = new Map<string, AudioTrack>();

      // 先添加本地音乐库中的曲目
      libraryTracks.value.forEach(t => {
        trackMap.set(t.path, t);
      });

      // 再添加播放列表中的曲目，如果路径相同则覆盖（使用播放列表中的 ID）
      playlists.value.forEach(pl => {
        pl.tracks.forEach(t => {
          trackMap.set(t.path, t);
        });
      });

      const allTracks = Array.from(trackMap.values());

      const lib: RustLibrary = {
        folders: libraryFolders.value,
        playlists: rustPlaylists,
        tracks: allTracks,
        scan_depth: scanDepth.value
      };

      await invoke('save_library', { library: lib });
    } catch (error) {
      console.error('[Store] Failed to save library:', error);
    }
  }

  async function addFolder(folderPath: string) {
    try {
      await invoke('add_folder', { folderPath });
      if (!libraryFolders.value.includes(folderPath)) {
        libraryFolders.value.push(folderPath);
      }
      await saveLibrary();
    } catch (error) {
      console.error('[Store] Failed to add folder:', error);
    }
  }

  async function removeFolder(folderPath: string) {
    try {
      const tracksToRemove = libraryTracks.value.filter(t => t.path.startsWith(folderPath));
      const trackIdsToRemove = new Set(tracksToRemove.map(t => t.id));

      for (const playlist of playlists.value) {
        const newTracks = playlist.tracks.filter(t => !trackIdsToRemove.has(t.id));
        if (newTracks.length !== playlist.tracks.length) {
          playlist.tracks = newTracks;
          playlist.updatedAt = Date.now();
        }
      }

      await invoke('remove_folder', { folderPath });

      libraryFolders.value = libraryFolders.value.filter(f => f !== folderPath);
      libraryTracks.value = libraryTracks.value.filter(t => !t.path.startsWith(folderPath));

      await saveLibrary();

      console.log(`[Store] Removed folder ${folderPath} and ${tracksToRemove.length} associated tracks`);
    } catch (error) {
      console.error('[Store] Failed to remove folder:', error);
    }
  }

  async function scanLibraryFolders() {
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<ScanProgress>('scan-progress', (event) => {
        scanProgress.value = event.payload;
      });

      // 检查文件夹是否存在
      const existingFolders: string[] = [];
      for (const folder of libraryFolders.value) {
        try {
          // 检查文件夹是否存在
          await invoke('read_dir', { path: folder });
          existingFolders.push(folder);
        } catch (error) {
          console.warn(`[Store] Folder not found or inaccessible: ${folder}`);
        }
      }

      // 如果文件夹列表有变化，更新并保存
      if (existingFolders.length !== libraryFolders.value.length) {
        console.log(`[Store] Removed ${libraryFolders.value.length - existingFolders.length} invalid folders`);
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

      console.log(`[Store] Incremental scan: ${unchangedCount} unchanged, ${tracksToProcess.length} to process, ${removedCount} removed`);

      const parsedTracks: AudioTrack[] = [];
      const batchSize = 5; // 每批处理5个文件
      
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
              console.warn(`[Store] Failed to parse metadata for ${file.path}:`, error);
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

      // 清理被删除的曲目
      if (removedTracks.length > 0) {
        console.log(`[Store] Removing ${removedTracks.length} tracks from index and cache`);
        
        try {
          const trackIds = removedTracks.map(t => t.id);
          await invoke('remove_tracks_from_index', { trackIds });
        } catch (error) {
          console.warn('[Store] Failed to remove tracks from index:', error);
        }

        for (const track of removedTracks) {
          if (track.coverId) {
            try {
              await invoke('remove_cover', { coverId: track.coverId });
            } catch (error) {
              console.warn(`[Store] Failed to remove cover: ${track.coverId}`, error);
            }
          }
        }

        // 从播放列表中移除
        const removedTrackIds = new Set(removedTracks.map(t => t.id));
        for (const playlist of playlists.value) {
          const newTracks = playlist.tracks.filter(t => !removedTrackIds.has(t.id));
          if (newTracks.length !== playlist.tracks.length) {
            playlist.tracks = newTracks;
            playlist.updatedAt = Date.now();
          }
        }
      }

      libraryTracks.value = finalTracks;
      await saveLibrary();

      if (tracksToProcess.length > 0) {
        try {
          await invoke('add_tracks_to_index', { tracks: parsedTracks });
        } catch (error) {
          console.warn('[Store] Failed to add tracks to index:', error);
        }

        console.log('[Store] Scan complete, starting cover preload...');
        await preloadAllCovers();
      }
    } catch (error) {
      console.error('[Store] Failed to scan library folders:', error);
    } finally {
      if (unlisten) {
        unlisten();
      }
      scanProgress.value = null;
    }
  }

  async function setScanDepth(depth: number) {
    scanDepth.value = Math.max(1, Math.min(10, depth));
    await saveLibrary();
  }

  unifiedAudioPlayer.onStateChange((state) => {
    playbackState.value = state;
    if (state === 'playing') {
      isLoading.value = false;
    }
    console.log('[Store] Playback state:', state);
  });

  let onTrackEndCallback: (() => void) | null = null;

  function setOnTrackEndCallback(cb: (() => void) | null) {
    onTrackEndCallback = cb;
  }

  unifiedAudioPlayer.onProgress((time, dur) => {
    currentTime.value = time;
    duration.value = dur;
  });

  unifiedAudioPlayer.onTrackEnd(() => {
    console.log('[Store] Track ended');
    if (onTrackEndCallback) {
      onTrackEndCallback();
    } else {
      playNext();
    }
  });

  async function browseFolder() {
    try {
      errorMessage.value = null;
      const folderPath = await invoke<string | null>('open_folder_dialog');

      if (!folderPath) {
        console.log('[Store] No folder selected');
        return;
      }

      console.log('[Store] Folder selected:', folderPath);
      isLocalBrowserOpen.value = true;
      localFiles.value = [];
      selectedFileIds.value.clear();

      const tracks = await invoke<AudioTrack[]>('scan_folder', { folderPath });
      localFiles.value = tracks;
    } catch (error) {
      console.error('[Store] Failed to open folder:', error);
      errorMessage.value = '无法打开文件夹';
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

  function addSelectedToQueue() {
    if (selectedFilesArray.value.length === 0) return;
    
    selectedFilesArray.value.forEach(track => {
      // 检查队列中是否已存在相同路径的歌曲
      const existingIndex = queue.value.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        // 如果存在，移除原有的
        queue.value.splice(existingIndex, 1);
      }
      // 添加新的到末尾
      queue.value.push({
        ...track,
        id: `track_${Date.now()}_${Math.random()}`
      });
    });
    
    deselectAllFiles();
    isLocalBrowserOpen.value = false;
    
    if (!currentTrack.value && queue.value.length > 0) {
      playTrack(0);
    }
  }

  function closeLocalBrowser() {
    isLocalBrowserOpen.value = false;
    deselectAllFiles();
  }

  async function createPlaylist(name: string): Promise<Playlist> {
    const playlist: Playlist = {
      id: `playlist_${Date.now()}`,
      name,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    playlists.value.push(playlist);
    await saveLibrary();
    return playlist;
  }

  async function deletePlaylist(id: string) {
    // 防止删除"我喜欢的音乐"播放列表
    if (id === FAVORITE_PLAYLIST_ID) {
      console.warn('[Store] Cannot delete favorite playlist');
      return;
    }

    const index = playlists.value.findIndex(p => p.id === id);
    if (index !== -1) {
      playlists.value.splice(index, 1);
      if (currentPlaylistId.value === id) {
        currentPlaylistId.value = null;
      }
      await saveLibrary();
    }
  }

  async function renamePlaylist(id: string, newName: string) {
    const playlist = playlists.value.find(p => p.id === id);
    if (playlist) {
      playlist.name = newName;
      playlist.updatedAt = Date.now();
      await saveLibrary();
    }
  }

  async function updatePlaylistDescription(id: string, description: string) {
    const playlist = playlists.value.find(p => p.id === id);
    if (playlist) {
      playlist.description = description;
      playlist.updatedAt = Date.now();
      await saveLibrary();
    }
  }

  async function addToPlaylist(playlistId: string, track: AudioTrack) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist) {
      // 检查是否已存在相同路径的歌曲
      const existingIndex = playlist.tracks.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        // 如果存在，移除原有的
        playlist.tracks.splice(existingIndex, 1);
      }
      // 添加新的到末尾，使用歌曲原有的 ID
      playlist.tracks.push(track);
      playlist.updatedAt = Date.now();
      await saveLibrary();
    }
  }

  async function removeFromPlaylist(playlistId: string, trackId: string) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist) {
      const index = playlist.tracks.findIndex(t => t.id === trackId);
      if (index !== -1) {
        playlist.tracks.splice(index, 1);
        playlist.updatedAt = Date.now();
        await saveLibrary();
      }
    }
  }

  async function reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist && fromIndex !== toIndex) {
      const [removed] = playlist.tracks.splice(fromIndex, 1);
      playlist.tracks.splice(toIndex, 0, removed);
      playlist.updatedAt = Date.now();
      await saveLibrary();
    }
  }

  function loadPlaylistToQueue(playlistId: string) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist && playlist.tracks.length > 0) {
      queue.value = [...playlist.tracks];
      currentPlaylistId.value = playlistId;
      currentIndex.value = 0;
      loadTrack(queue.value[0]);
    }
  }

  async function addSelectedToPlaylistAndSave(playlistId: string) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (!playlist) {
      console.error('[Store] Playlist not found:', playlistId);
      return;
    }

    console.log('[Store] Adding', selectedFilesArray.value.length, 'tracks to playlist:', playlist.name);

    selectedFilesArray.value.forEach(track => {
      // 检查是否已存在相同路径的歌曲
      const existingIndex = playlist.tracks.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        // 如果存在，移除原有的
        playlist.tracks.splice(existingIndex, 1);
      }
      // 添加新的到末尾，使用歌曲原有的 ID
      playlist.tracks.push(track);
    });

    playlist.updatedAt = Date.now();
    console.log('[Store] Playlist now has', playlist.tracks.length, 'tracks');

    deselectAllFiles();
    await saveLibrary();
    console.log('[Store] Library saved');
  }

  async function loadTrack(track: AudioTrack, autoPlay = true) {
    if (!track.path) return;

    isLoading.value = true;
    errorMessage.value = null;
    playbackState.value = 'loading';

    try {
      console.log('[Store] Loading track:', track.title, track.path);

      // 使用 convertFileSrc 让浏览器直接流式读取文件
      const fileUrl = convertFileSrc(track.path);
      console.log('[Store] File URL:', fileUrl);

      const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';
      const needsFFmpeg = ['ape', 'wma', 'tak', 'tta'].includes(extension);

      let audioData: Uint8Array | undefined;

      // 只有需要 FFmpeg 的格式才读取文件
      if (needsFFmpeg) {
        console.log('[Store] Reading file for FFmpeg transcoding');
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log('[Store] Read', arrayBuffer.byteLength, 'bytes from file');
        audioData = new Uint8Array(arrayBuffer);
      }

      // 封面已经在扫描时提取，直接使用
      if (track.coverUrl) {
        console.log('[Store] Track already has coverUrl:', track.coverUrl);
      }

      // 加载歌词
      if (!track.lrc) {
        await loadLyrics(track);
      }

      if (autoPlay) {
        await unifiedAudioPlayer.loadAndPlay(track, fileUrl, audioData);
      } else {
        await unifiedAudioPlayer.load(track, fileUrl, audioData);
      }

      // 创建一个新的 track 对象以确保响应式更新
      currentTrack.value = { ...track };

      console.log('[Store] Track loaded successfully, coverUrl:', currentTrack.value.coverUrl, 'hasLyrics:', !!currentTrack.value.lrc);

      // 自动保存播放状态
      savePlaybackState();

      // 预加载下一首歌
      preloadNextTrack();
    } catch (error) {
      console.error('[Store] Failed to load track:', error);
      errorMessage.value = '无法加载音频文件';
      playbackState.value = 'error';
      isLoading.value = false;
    }
  }

  async function preloadNextTrack() {
    const nextIndex = currentIndex.value + 1;
    if (nextIndex >= queue.value.length) return;

    const nextTrack = queue.value[nextIndex];
    if (!nextTrack?.path) return;

    try {
      console.log('[Store] Preloading next track:', nextTrack.title);

      const extension = nextTrack.path.split('.').pop()?.toLowerCase() || 'mp3';
      const needsFFmpeg = ['ape', 'wma', 'tak', 'tta'].includes(extension);

      // 只有需要 FFmpeg 的格式才预加载
      if (needsFFmpeg) {
        const fileUrl = convertFileSrc(nextTrack.path);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await unifiedAudioPlayer.preload(nextTrack, uint8Array);
      } else {
        console.log('[Store] Skip preload for native format:', extension);
      }
    } catch (error) {
      console.warn('[Store] Failed to preload next track:', error);
    }
  }

  function playTrack(index: number) {
    if (index < 0 || index >= queue.value.length) return;
    
    currentIndex.value = index;
    loadTrack(queue.value[index]);
  }

  function playTrackFromPlaylist(playlistId: string, trackId: string) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (!playlist) return;
    
    const trackIndex = playlist.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;
    
    queue.value = [...playlist.tracks];
    currentPlaylistId.value = playlistId;
    currentIndex.value = trackIndex;
    loadTrack(queue.value[trackIndex]);
  }

  function addToQueue(track: AudioTrack) {
    // 检查队列中是否已存在相同路径的歌曲
    const existingIndex = queue.value.findIndex(t => t.path === track.path);
    if (existingIndex !== -1) {
      // 如果存在，移除原有的
      queue.value.splice(existingIndex, 1);
    }
    // 添加新的到末尾
    queue.value.push({ ...track, id: `track_${Date.now()}_${Math.random()}` });
  }

  function insertAndPlayNext(track: AudioTrack) {
    // 检查队列中是否已存在相同路径的歌曲
    const existingIndex = queue.value.findIndex(t => t.path === track.path);
    if (existingIndex !== -1) {
      // 如果存在，移除原有的
      queue.value.splice(existingIndex, 1);
    }
    const insertIndex = currentIndex.value + 1;
    const newTrack = { ...track, id: `track_${Date.now()}_${Math.random()}` };
    queue.value.splice(insertIndex, 0, newTrack);

    if (!currentTrack.value) {
      playTrack(0);
    }
  }

  function removeFromQueue(index: number) {
    if (index < 0 || index >= queue.value.length) return;
    
    queue.value.splice(index, 1);
    
    if (index < currentIndex.value) {
      currentIndex.value--;
    } else if (index === currentIndex.value) {
      if (queue.value.length > 0) {
        if (currentIndex.value >= queue.value.length) {
          currentIndex.value = queue.value.length - 1;
        }
        loadTrack(queue.value[currentIndex.value]);
      } else {
        currentTrack.value = null;
        currentIndex.value = -1;
        unifiedAudioPlayer.stop();
      }
    }
  }

  function clearQueue() {
    unifiedAudioPlayer.stop();
    queue.value = [];
    currentTrack.value = null;
    currentIndex.value = -1;
  }

  function togglePlay() {
    if (!currentTrack.value) {
      if (queue.value.length > 0) {
        playTrack(0);
      }
      return;
    }

    const state = unifiedAudioPlayer.getState();
    console.log('[Store] Toggle play, current state:', state);

    if (state === 'playing') {
      unifiedAudioPlayer.pause();
    } else if (state === 'paused' || state === 'idle') {
      unifiedAudioPlayer.play();
    }
  }

  function unpausePlayback() {
    if (!currentTrack.value) {
      if (queue.value.length > 0) {
        playTrack(0);
      }
      return;
    }
    unifiedAudioPlayer.play();
  }

  function pausePlayback() {
    unifiedAudioPlayer.pause();
  }

  function setRepeatMode(mode: 'none' | 'one' | 'all') {
    repeatMode.value = mode;
    savePlaybackModeSettings();
  }

  function setShuffle(enabled: boolean) {
    isShuffle.value = enabled;
    savePlaybackModeSettings();
  }

  function toggleShuffle() {
    isShuffle.value = !isShuffle.value;
    savePlaybackModeSettings();
  }

  function playNext() {
    if (queue.value.length === 0) return;
    
    let nextIndex = currentIndex.value + 1;
    
    if (nextIndex >= queue.value.length) {
      nextIndex = 0;
    }
    
    playTrack(nextIndex);
  }

  function playPrev() {
    if (queue.value.length === 0) return;
    
    let prevIndex = currentIndex.value - 1;
    
    if (prevIndex < 0) {
      prevIndex = queue.value.length - 1;
    }
    
    playTrack(prevIndex);
  }

  function seek(time: number) {
    unifiedAudioPlayer.seek(time);
    currentTime.value = time;
    savePlaybackState();
  }

  function setVolume(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    volume.value = clampedValue;
    unifiedAudioPlayer.setVolume(clampedValue);
    // 持久化音量设置
    saveVolumeSettings(clampedValue);
  }

  // 保存音量设置到后端
  async function saveVolumeSettings(vol: number) {
    try {
      const current = await invoke<{
        volume: number;
        lyrics_display_mode: string;
        show_translation: boolean;
        enable_lyrics_blur: boolean;
        last_played_track_id: string | null;
        last_played_playlist_id: string | null;
      }>('get_settings');
      await invoke('save_settings', {
        settings: {
          volume: vol,
          lyrics_display_mode: current.lyrics_display_mode,
          show_translation: current.show_translation,
          enable_lyrics_blur: current.enable_lyrics_blur,
          last_played_track_id: current.last_played_track_id,
          last_played_playlist_id: current.last_played_playlist_id
        }
      });
    } catch (error) {
      console.error('[Store] Failed to save volume settings:', error);
    }
  }

  // 加载音量设置
  async function loadVolumeSettings() {
    try {
      const settings = await invoke<{
        volume: number;
        repeat_mode: string;
        shuffle: boolean;
      }>('get_settings');
      if (settings && typeof settings.volume === 'number') {
        volume.value = settings.volume;
        unifiedAudioPlayer.setVolume(settings.volume);
      }
      if (settings.repeat_mode) {
        repeatMode.value = settings.repeat_mode as 'none' | 'one' | 'all';
      }
      if (typeof settings.shuffle === 'boolean') {
        isShuffle.value = settings.shuffle;
      }
    } catch (error) {
      console.error('[Store] Failed to load volume settings:', error);
    }
  }

  // 保存播放模式设置
  async function savePlaybackModeSettings() {
    try {
      const current = await invoke<{
        volume: number;
        lyrics_display_mode: string;
        show_translation: boolean;
        enable_lyrics_blur: boolean;
        last_played_track_id: string | null;
        last_played_playlist_id: string | null;
        repeat_mode: string;
        shuffle: boolean;
      }>('get_settings');
      await invoke('save_settings', {
        settings: {
          volume: current.volume,
          lyrics_display_mode: current.lyrics_display_mode,
          show_translation: current.show_translation,
          enable_lyrics_blur: current.enable_lyrics_blur,
          last_played_track_id: current.last_played_track_id,
          last_played_playlist_id: current.last_played_playlist_id,
          repeat_mode: repeatMode.value,
          shuffle: isShuffle.value
        }
      });
    } catch (error) {
      console.error('[Store] Failed to save playback mode settings:', error);
    }
  }

  function setCurrentTime(time: number) {
    currentTime.value = time;
    unifiedAudioPlayer.seek(time);
  }

  function adjustLyricsOffset(delta: number) {
    lyricsOffset.value += delta;
  }

  function resetLyricsOffset() {
    lyricsOffset.value = 0;
  }

  // 检查歌曲是否被喜欢
  function isTrackFavorite(trackPath: string): boolean {
    const favoritePlaylist = playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID);
    if (!favoritePlaylist) return false;
    return favoritePlaylist.tracks.some(t => t.path === trackPath);
  }

  // 切换歌曲的喜欢状态
  async function toggleFavorite(track: AudioTrack) {
    const favoritePlaylist = playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID);
    if (!favoritePlaylist) {
      console.error('[Store] Favorite playlist not found');
      return;
    }

    const existingIndex = favoritePlaylist.tracks.findIndex(t => t.path === track.path);

    if (existingIndex !== -1) {
      favoritePlaylist.tracks.splice(existingIndex, 1);
    } else {
      favoritePlaylist.tracks.push(track);
    }

    favoritePlaylist.updatedAt = Date.now();
    await saveLibrary();
  }

  // 获取"我喜欢的音乐"播放列表
  const favoritePlaylist = computed(() => {
    return playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID) || null;
  });

  // 保存播放状态（关闭前调用）
  async function savePlaybackState() {
    try {
      await invoke('save_playback_state', {
        trackId: currentTrack.value?.id || null,
        playlistId: currentPlaylistId.value
      });
    } catch (error) {
      console.error('[Store] Failed to save playback state:', error);
    }
  }

  // 加载播放状态（启动时调用）
  async function loadPlaybackState(): Promise<{ trackId: string | null; position: number; playlistId: string | null }> {
    try {
      const [trackId, position, playlistId] = await invoke<[string | null, number, string | null]>('get_playback_state');
      return { trackId, position, playlistId };
    } catch (error) {
      console.error('[Store] Failed to load playback state:', error);
      return { trackId: null, position: 0, playlistId: null };
    }
  }

  // 恢复播放状态
  async function restorePlaybackState() {
    const { trackId, position, playlistId } = await loadPlaybackState();
    if (!trackId) return;

    // 恢复播放列表
    if (playlistId) {
      currentPlaylistId.value = playlistId;
      const playlist = playlists.value.find(p => p.id === playlistId);
      if (playlist) {
        queue.value = [...playlist.tracks];
        const trackIndex = playlist.tracks.findIndex(t => t.id === trackId);
        if (trackIndex !== -1) {
          currentIndex.value = trackIndex;
          // 仅加载不自动播放
          await loadTrack(queue.value[trackIndex], false);

          // 等待获取音频时长，然后恢复播放位置
          const waitForDuration = () => {
            return new Promise<void>((resolve) => {
              const timeout = 5000;
              const startTime = Date.now();
              const check = () => {
                if (duration.value > 0) {
                  resolve();
                } else if (Date.now() - startTime > timeout) {
                  resolve();
                } else {
                  setTimeout(check, 100);
                }
              };
              check();
            });
          };

          await waitForDuration();

          if (position > 0 && position < duration.value) {
            unifiedAudioPlayer.seek(position);
            currentTime.value = position;
          }
        }
      }
    }
  }

  return {
    currentTrack,
    queue,
    currentIndex,
    playbackState,
    volume,
    currentTime,
    duration,
    isPlaying,
    isPaused,
    isLoading,
    hasTrack,
    currentCoverUrl,
    progress,
    errorMessage,
    playlists,
    currentPlaylistId,
    currentPlaylist,
    localFiles,
    selectedFileIds,
    selectedFilesArray,
    isLocalBrowserOpen,
    libraryFolders,
    libraryTracks,
    tracksByFolder,
    scanDepth,
    scanProgress,
    loadLibrary,
    loadVolumeSettings,
    addFolder,
    removeFolder,
    scanLibraryFolders,
    setScanDepth,
    browseFolder,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    selectFolder,
    addSelectedToPlaylist: addSelectedToPlaylistAndSave,
    addSelectedToQueue,
    closeLocalBrowser,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    updatePlaylistDescription,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylistTracks,
    loadPlaylistToQueue,
    loadTrack,
    playTrack,
    playTrackFromPlaylist,
    addToQueue,
    insertAndPlayNext,
    removeFromQueue,
    clearQueue,
    togglePlay,
    unpausePlayback,
    pausePlayback,
    setRepeatMode,
    playNext,
    playPrev,
    setOnTrackEndCallback,
    seek,
    setVolume,
    setCurrentTime,
    preloadAllCovers,
    isTrackFavorite,
    toggleFavorite,
    favoritePlaylist,
    lyricsOffset,
    currentLyricIndex,
    adjustLyricsOffset,
    resetLyricsOffset,
    savePlaybackState,
    restorePlaybackState,
    isShuffle,
    repeatMode,
    setShuffle,
    toggleShuffle,
    savePlaybackModeSettings,
  };
});
