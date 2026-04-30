export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  duration: number;
  format: string;
  coverUrl?: string;
  coverId?: string;
  lrc?: string;
  fileMtime?: number;
  hasLrc: boolean;
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
  coverUrl?: string;
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

export type RepeatMode = 'none' | 'one' | 'all';

export type LyricsFormat = 'lrc' | 'ass' | 'srt' | 'auto';

export interface KaraokeWord {
  text: string;
  start: number;
  end: number;
}

export interface KaraokeInfo {
  fullText: string;
  timings: Array<{ time: number; position: number }>;
}

export interface LyricLine {
  time: number;
  text?: string;
  texts?: string[];
  words?: KaraokeWord[];
  karaoke?: KaraokeInfo | null;
}

export const FFMPEG_FORMATS = ['ape', 'wma', 'tak', 'tta'] as const;

export function needsFFmpegConversion(format: string): boolean {
  return (FFMPEG_FORMATS as readonly string[]).includes(format.toLowerCase());
}
