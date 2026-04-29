import { invoke } from '@tauri-apps/api/core';
import type { AudioTrack, Playlist } from '@/types';

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

/**
 * 将前端 Playlist 转换为 Rust 格式
 */
function toRustPlaylists(playlists: Playlist[]): RustPlaylist[] {
  return playlists.map(p => ({
    id: p.id,
    name: p.name,
    track_ids: p.tracks.map(t => t.id),
    created_at: p.createdAt,
    updated_at: p.updatedAt
  }));
}

/**
 * 将 RustPlaylist 转换为前端 Playlist
 */
export function fromRustPlaylists(rustPlaylists: RustPlaylist[], allTracks: AudioTrack[]): Playlist[] {
  const trackMap = new Map<string, AudioTrack>();
  allTracks.forEach(t => trackMap.set(t.id, t));

  return rustPlaylists.map(rp => ({
    id: rp.id,
    name: rp.name,
    tracks: rp.track_ids.map(id => trackMap.get(id)).filter((t): t is AudioTrack => t !== undefined),
    createdAt: rp.created_at,
    updatedAt: rp.updated_at
  }));
}

/**
 * 保存音乐库到后端
 * 这是唯一与 Rust 后端交互的持久化入口
 */
export async function saveLibraryToBackend(
  folders: string[],
  playlists: Playlist[],
  tracks: AudioTrack[],
  scanDepth: number
): Promise<void> {
  const trackMap = new Map<string, AudioTrack>();

  tracks.forEach(t => trackMap.set(t.path, t));
  playlists.forEach(pl => {
    pl.tracks.forEach(t => trackMap.set(t.path, t));
  });

  const allTracks = Array.from(trackMap.values());

  const lib: RustLibrary = {
    folders,
    playlists: toRustPlaylists(playlists),
    tracks: allTracks,
    scan_depth: scanDepth
  };

  await invoke('save_library', { library: lib });
}

/**
 * 从后端加载音乐库
 */
export async function loadLibraryFromBackend(): Promise<{
  folders: string[];
  tracks: AudioTrack[];
  scanDepth: number;
  playlists: Playlist[];
}> {
  const lib = await invoke<RustLibrary>('get_library');

  const tracks = lib.tracks || [];
  const rustPlaylists = lib.playlists || [];

  return {
    folders: lib.folders || [],
    tracks,
    scanDepth: lib.scan_depth ?? 3,
    playlists: fromRustPlaylists(rustPlaylists, tracks)
  };
}
