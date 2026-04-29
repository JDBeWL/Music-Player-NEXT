import { NativeAudioPlayer } from './NativeAudioPlayer';
import { FFmpegAudioService } from './FFmpegService';
import type { AudioTrack, PlaybackState } from '@/types';

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
   * 判断格式是否需要 FFmpeg 转码
   */
  private needsFFmpegConversion(extension: string): boolean {
    const needsConversion = ['ape', 'wma', 'tak', 'tta'];
    return needsConversion.includes(extension.toLowerCase());
  }

  /**
   * 加载并播放音频
   * @param track 音轨信息
   * @param fileUrl 文件 URL（用于原生播放）
   * @param audioData 音频数据（用于 FFmpeg 转码）
   */
  async loadAndPlay(track: AudioTrack, fileUrl: string, audioData?: Uint8Array): Promise<void> {
    const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';
    
    console.log('[UnifiedPlayer] Loading:', track.title, 'format:', extension);

    // 停止当前播放
    this.stop();
    this.currentTrack = track;

    if (this.needsFFmpegConversion(extension)) {
      // 使用 FFmpeg 转码播放
      console.log('[UnifiedPlayer] Using FFmpeg for:', extension);
      this.currentPlayer = 'ffmpeg';
      
      if (!audioData) {
        throw new Error('Audio data required for FFmpeg conversion');
      }
      
      await this.ffmpegPlayer.loadAndPlay(track, audioData);
    } else {
      // 使用原生播放器流式播放
      console.log('[UnifiedPlayer] Using native player for:', extension);
      this.currentPlayer = 'native';
      await this.nativePlayer.loadAndPlay(track, fileUrl);
    }
  }

  /**
   * 仅加载音频，不自动播放（用于恢复播放状态）
   */
  async load(track: AudioTrack, fileUrl: string, audioData?: Uint8Array): Promise<void> {
    const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';

    console.log('[UnifiedPlayer] Loading (no play):', track.title, 'format:', extension);

    this.stop();
    this.currentTrack = track;

    if (this.needsFFmpegConversion(extension)) {
      console.log('[UnifiedPlayer] Using FFmpeg for:', extension);
      this.currentPlayer = 'ffmpeg';

      if (!audioData) {
        throw new Error('Audio data required for FFmpeg conversion');
      }

      await this.ffmpegPlayer.load(track, audioData);
    } else {
      console.log('[UnifiedPlayer] Using native player for:', extension);
      this.currentPlayer = 'native';
      await this.nativePlayer.load(track, fileUrl);
    }
  }

  /**
   * 预加载下一首（仅用于 FFmpeg 转码格式）
   */
  async preload(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';
    
    if (this.needsFFmpegConversion(extension)) {
      console.log('[UnifiedPlayer] Preloading with FFmpeg:', track.title);
      await this.ffmpegPlayer.preloadTrack(track, audioData);
    } else {
      // 原生格式不需要预加载，流式播放很快
      console.log('[UnifiedPlayer] Skip preload for native format:', extension);
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

