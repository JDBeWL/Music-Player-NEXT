// 歌词格式类型
export type LyricsFormat = 'lrc' | 'ass' | 'srt' | 'auto';

// 卡拉OK单词
export interface KaraokeWord {
  text: string;
  start: number;
  end: number;
}

// 卡拉OK信息
export interface KaraokeInfo {
  fullText: string;
  timings: Array<{ time: number; position: number }>;
}

// 歌词行
export interface LyricLine {
  time: number;
  text?: string;
  texts?: string[];
  words?: KaraokeWord[];
  karaoke?: KaraokeInfo | null;
}

