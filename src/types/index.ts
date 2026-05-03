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
  hasLrc?: boolean;
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

export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
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

export interface KeyboardShortcut {
  code: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export type LyricsDisplayMode = 'modern' | 'classic';
export type ThemeMode = 'dark' | 'light';
export type CloseBehavior = 'to_tray' | 'quit';

export interface AppSettings {
  volume: number;
  lyrics_display_mode: LyricsDisplayMode;
  show_translation: boolean;
  enable_lyrics_blur: boolean;
  theme_mode: ThemeMode;
  close_behavior?: CloseBehavior;
  persist_playback?: boolean;
  netease_real_ip?: string;
  keyboard_shortcuts?: Record<string, KeyboardShortcut>;
}

export const FFMPEG_FORMATS = ['ape', 'wma', 'tak', 'tta'] as const;

export function needsFFmpegConversion(format: string): boolean {
  return (FFMPEG_FORMATS as readonly string[]).includes(format.toLowerCase());
}

/**
 * 从 AudioTrack 中提取音频格式扩展名
 * 优先使用 track.format，否则从 path 中解析
 */
export function getAudioFormat(track: AudioTrack): string {
  return track.format || track.path.split('.').pop()?.toLowerCase() || 'mp3';
}

/**
 * 判断 AudioTrack 是否需要 FFmpeg 转码
 */
export function trackNeedsFFmpeg(track: AudioTrack): boolean {
  return needsFFmpegConversion(getAudioFormat(track));
}
