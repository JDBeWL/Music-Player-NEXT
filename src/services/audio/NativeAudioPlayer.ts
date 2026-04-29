import type { AudioTrack, PlaybackState } from '@/types';

type StateChangeCallback = (state: PlaybackState) => void;
type ProgressCallback = (currentTime: number, duration: number) => void;
type TrackEndCallback = () => void;

/**
 * 原生音频播放器 - 使用 HTML5 Audio 元素流式播放
 * 支持浏览器原生格式：mp3, flac, wav, ogg, m4a, aac
 */
export class NativeAudioPlayer {
  private audio: HTMLAudioElement;
  private state: PlaybackState = 'idle';
  private currentTrack: AudioTrack | null = null;
  private progressInterval: number | null = null;

  private stateListeners: Set<StateChangeCallback> = new Set();
  private progressListeners: Set<ProgressCallback> = new Set();
  private trackEndListeners: Set<TrackEndCallback> = new Set();

  constructor() {
    this.audio = new Audio();
    this.audio.volume = 0.5;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.audio.addEventListener('loadstart', () => {
      console.log('[NativePlayer] Load start');
      this.setState('loading');
    });

    this.audio.addEventListener('canplay', () => {
      console.log('[NativePlayer] Can play');
    });

    this.audio.addEventListener('playing', () => {
      console.log('[NativePlayer] Playing');
      this.setState('playing');
      this.startProgressTracking();
    });

    this.audio.addEventListener('pause', () => {
      console.log('[NativePlayer] Paused');
      if (this.state === 'playing') {
        this.setState('paused');
      }
      this.stopProgressTracking();
    });

    this.audio.addEventListener('ended', () => {
      console.log('[NativePlayer] Ended');
      this.setState('idle');
      this.stopProgressTracking();
      this.trackEndListeners.forEach(cb => cb());
    });

    this.audio.addEventListener('error', (e) => {
      console.error('[NativePlayer] Error:', e);
      this.setState('error');
      this.stopProgressTracking();
    });

    this.audio.addEventListener('timeupdate', () => {
      // 实时更新由 progressInterval 处理
    });
  }

  async load(track: AudioTrack, fileUrl: string): Promise<void> {
    console.log('[NativePlayer] Loading track (no play):', track.title, fileUrl);

    this.stop();
    this.currentTrack = track;
    this.setState('loading');

    try {
      this.audio.src = fileUrl;
      this.audio.load();

      // 等待可以播放但不自动播放
      await new Promise<void>((resolve, reject) => {
        let cleanup = () => {};

        const onCanPlay = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to load audio'));
        };

        const removeListeners = () => {
          this.audio.removeEventListener('canplay', onCanPlay);
          this.audio.removeEventListener('error', onError);
        };

        this.audio.addEventListener('canplay', onCanPlay, { once: true });
        this.audio.addEventListener('error', onError, { once: true });

        // 超时处理
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Audio load timeout'));
        }, 5000);

        cleanup = () => {
          clearTimeout(timeoutId);
          removeListeners();
        };
      });

      // 等待 duration 可用
      await new Promise<void>((resolve) => {
        if (this.audio.duration && !isNaN(this.audio.duration)) {
          resolve();
          return;
        }
        const onDurationChange = () => {
          this.audio.removeEventListener('durationchange', onDurationChange);
          resolve();
        };
        this.audio.addEventListener('durationchange', onDurationChange, { once: true });
        setTimeout(resolve, 1000);
      });

      // 触发 progress 回调，让 store 获取 duration
      this.progressListeners.forEach(cb => cb(0, this.audio.duration || 0));

      this.setState('paused');
      console.log('[NativePlayer] Track loaded, ready to play, duration:', this.audio.duration);
    } catch (error) {
      console.error('[NativePlayer] Failed to load:', error);
      this.setState('error');
      throw error;
    }
  }

  async loadAndPlay(track: AudioTrack, fileUrl: string): Promise<void> {
    console.log('[NativePlayer] Loading track:', track.title, fileUrl);

    this.stop();
    this.currentTrack = track;
    this.setState('loading');

    try {
      this.audio.src = fileUrl;
      this.audio.load();
      
      // 等待可以播放
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to load audio'));
        };
        const cleanup = () => {
          this.audio.removeEventListener('canplay', onCanPlay);
          this.audio.removeEventListener('error', onError);
        };
        
        this.audio.addEventListener('canplay', onCanPlay, { once: true });
        this.audio.addEventListener('error', onError, { once: true });
      });

      await this.audio.play();
      console.log('[NativePlayer] Playing started');
    } catch (error) {
      console.error('[NativePlayer] Failed to load and play:', error);
      this.setState('error');
      throw error;
    }
  }

  play(): void {
    if (this.audio.src) {
      this.audio.play().catch(err => {
        console.error('[NativePlayer] Play failed:', err);
        this.setState('error');
      });
    }
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.src = '';
    this.stopProgressTracking();
    this.setState('idle');
  }

  seek(time: number): void {
    this.audio.currentTime = Math.max(0, Math.min(time, this.getDuration()));
  }

  setVolume(value: number): void {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  getCurrentTime(): number {
    return this.audio.currentTime;
  }

  getDuration(): number {
    return this.audio.duration || 0;
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentTrack(): AudioTrack | null {
    return this.currentTrack;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  onTrackEnd(callback: TrackEndCallback): () => void {
    this.trackEndListeners.add(callback);
    return () => this.trackEndListeners.delete(callback);
  }

  private setState(newState: PlaybackState): void {
    this.state = newState;
    this.stateListeners.forEach(cb => cb(newState));
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressInterval = window.setInterval(() => {
      this.progressListeners.forEach(cb => {
        cb(this.getCurrentTime(), this.getDuration());
      });
    }, 250);
  }

  private stopProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  destroy(): void {
    this.stop();
    this.stateListeners.clear();
    this.progressListeners.clear();
    this.trackEndListeners.clear();
  }
}

