import { NativeAudioPlayer } from './NativeAudioPlayer';
import { FFmpegAudioService } from './FFmpegService';
import type { AudioTrack, PlaybackState } from '@/types';
import { needsFFmpegConversion } from '@/types';

type StateChangeCallback = (state: PlaybackState) => void;
type ProgressCallback = (currentTime: number, duration: number) => void;
type TrackEndCallback = () => void;

/**
 * 统一音频播放器管理器
 * 自动选择最优播放方式：
 * - 原生支持格式（mp3/flac/wav/ogg/m4a/aac）-> 流式播放，快速启动
 * - 特殊格式（ape/wma/tak/tta）-> FFmpeg Worker 转码
 */
class UnifiedAudioPlayer {
  private nativePlayer: NativeAudioPlayer;
  private ffmpegPlayer: FFmpegAudioService;
  private currentPlayer: 'native' | 'ffmpeg' | null = null;
  private currentTrack: AudioTrack | null = null;

  constructor() {
    this.nativePlayer = new NativeAudioPlayer();
    this.ffmpegPlayer = new FFmpegAudioService();
  }

  /**
   * 加载并播放音频
   * @param track 音轨信息
   * @param fileUrl 文件 URL（用于原生播放）
   * @param audioData 音频数据（用于 FFmpeg 转码）
   */
  async loadAndPlay(track: AudioTrack, fileUrl: string, audioData?: Uint8Array): Promise<void> {
    const extension = track.format || track.path.split('.').pop()?.toLowerCase() || 'mp3';

    this.stop();
    this.currentTrack = track;

    if (needsFFmpegConversion(extension)) {
      this.currentPlayer = 'ffmpeg';
      
      if (!audioData) {
        throw new Error('Audio data required for FFmpeg conversion');
      }
      
      await this.ffmpegPlayer.loadAndPlay(track, audioData);
    } else {
      this.currentPlayer = 'native';
      await this.nativePlayer.loadAndPlay(track, fileUrl);
    }
  }

  async load(track: AudioTrack, fileUrl: string, audioData?: Uint8Array): Promise<void> {
    const extension = track.format || track.path.split('.').pop()?.toLowerCase() || 'mp3';

    this.stop();
    this.currentTrack = track;

    if (needsFFmpegConversion(extension)) {
      this.currentPlayer = 'ffmpeg';

      if (!audioData) {
        throw new Error('Audio data required for FFmpeg conversion');
      }

      await this.ffmpegPlayer.load(track, audioData);
    } else {
      this.currentPlayer = 'native';
      await this.nativePlayer.load(track, fileUrl);
    }
  }

  async preload(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    const extension = track.format || track.path.split('.').pop()?.toLowerCase() || 'mp3';
    
    if (needsFFmpegConversion(extension)) {
      await this.ffmpegPlayer.preloadTrack(track, audioData);
    }
  }

  play(): void {
    if (this.currentPlayer === 'native') {
      this.nativePlayer.play();
    } else if (this.currentPlayer === 'ffmpeg') {
      this.ffmpegPlayer.play();
    }
  }

  pause(): void {
    if (this.currentPlayer === 'native') {
      this.nativePlayer.pause();
    } else if (this.currentPlayer === 'ffmpeg') {
      this.ffmpegPlayer.pause();
    }
  }

  stop(): void {
    this.nativePlayer.stop();
    this.ffmpegPlayer.stop();
    this.currentPlayer = null;
  }

  seek(time: number): void {
    if (this.currentPlayer === 'native') {
      this.nativePlayer.seek(time);
    } else if (this.currentPlayer === 'ffmpeg') {
      this.ffmpegPlayer.seek(time);
    }
  }

  setVolume(value: number): void {
    this.nativePlayer.setVolume(value);
    this.ffmpegPlayer.setVolume(value);
  }

  getCurrentTime(): number {
    if (this.currentPlayer === 'native') {
      return this.nativePlayer.getCurrentTime();
    } else if (this.currentPlayer === 'ffmpeg') {
      return this.ffmpegPlayer.getCurrentTime();
    }
    return 0;
  }

  getDuration(): number {
    if (this.currentPlayer === 'native') {
      return this.nativePlayer.getDuration();
    } else if (this.currentPlayer === 'ffmpeg') {
      return this.ffmpegPlayer.getDuration();
    }
    return 0;
  }

  getState(): PlaybackState {
    if (this.currentPlayer === 'native') {
      return this.nativePlayer.getState();
    } else if (this.currentPlayer === 'ffmpeg') {
      return this.ffmpegPlayer.getState();
    }
    return 'idle';
  }

  getCurrentTrack(): AudioTrack | null {
    return this.currentTrack;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    const unsubNative = this.nativePlayer.onStateChange(callback);
    const unsubFfmpeg = this.ffmpegPlayer.onStateChange(callback);
    return () => {
      unsubNative();
      unsubFfmpeg();
    };
  }

  onProgress(callback: ProgressCallback): () => void {
    const unsubNative = this.nativePlayer.onProgress(callback);
    const unsubFfmpeg = this.ffmpegPlayer.onProgress(callback);
    return () => {
      unsubNative();
      unsubFfmpeg();
    };
  }

  onTrackEnd(callback: TrackEndCallback): () => void {
    const unsubNative = this.nativePlayer.onTrackEnd(callback);
    const unsubFfmpeg = this.ffmpegPlayer.onTrackEnd(callback);
    return () => {
      unsubNative();
      unsubFfmpeg();
    };
  }

  async init(): Promise<void> {
    // 预初始化 FFmpeg（在后台）
    await this.ffmpegPlayer.init();
  }

  clearCache(): void {
    this.ffmpegPlayer.clearCache();
  }

  getCacheSize(): number {
    return this.ffmpegPlayer.getCacheSize();
  }

  async destroy(): Promise<void> {
    this.nativePlayer.destroy();
    await this.ffmpegPlayer.destroy();
  }
}

export const unifiedAudioPlayer = new UnifiedAudioPlayer();
export { UnifiedAudioPlayer };

