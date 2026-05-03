import type { AudioTrack, PlaybackState } from '@/types';
import { ProgressTracker } from './ProgressTracker';

type StateChangeCallback = (state: PlaybackState) => void;
type TrackEndCallback = () => void;

export class NativeAudioPlayer {
  private audio: HTMLAudioElement;
  private preloadAudio: HTMLAudioElement | null = null;
  private state: PlaybackState = 'idle';
  private currentTrack: AudioTrack | null = null;
  private preloadedTrack: AudioTrack | null = null;
  private _isStopping = false;

  private stateListeners: Set<StateChangeCallback> = new Set();
  private trackEndListeners: Set<TrackEndCallback> = new Set();
  private progressTracker: ProgressTracker;

  constructor() {
    this.audio = new Audio();
    this.audio.volume = 0.5;

    this.progressTracker = new ProgressTracker(
      () => this.audio.currentTime,
      () => this.audio.duration || 0,
      () => {
        if (this.state === 'playing') {
          this.progressTracker.startTracking();
        }
      }
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.audio.addEventListener('loadstart', () => {
      this.setState('loading');
    });

    this.audio.addEventListener('playing', () => {
      this.setState('playing');
      this.progressTracker.startTracking();
    });

    this.audio.addEventListener('pause', () => {
      if (this._isStopping) return;
      if (!this.audio.src) return;
      if (this.state === 'playing') {
        this.setState('paused');
      }
      this.progressTracker.stopTracking();
    });

    this.audio.addEventListener('ended', () => {
      this.setState('idle');
      this.progressTracker.stopTracking();
      [...this.trackEndListeners].forEach(cb => cb());
    });

    this.audio.addEventListener('error', (e) => {
      console.error('[NativePlayer] Error:', e);
      this.setState('error');
      this.progressTracker.stopTracking();
    });
  }

  private async waitForCanPlay(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Audio load timeout'));
      }, 5000);

      cleanup = () => {
        clearTimeout(timeoutId);
        removeListeners();
      };
    });
  }

  private async waitForDuration(): Promise<void> {
    return new Promise<void>((resolve) => {
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
  }

  private async loadInternal(track: AudioTrack, fileUrl: string, autoPlay: boolean): Promise<void> {
    this.stop();
    this.currentTrack = track;
    this.setState('loading');

    try {
      this.audio.src = fileUrl;
      this.audio.load();

      await this.waitForCanPlay();

      if (autoPlay) {
        await this.audio.play();
        return;
      }

      await this.waitForDuration();

      this.progressTracker.notifyProgress(0, this.audio.duration || 0);

      this.setState('paused');
    } catch (error) {
      console.error('[NativePlayer] Failed to load:', error);
      this.setState('error');
      throw error;
    }
  }

  async load(track: AudioTrack, fileUrl: string): Promise<void> {
    await this.loadInternal(track, fileUrl, false);
  }

  async loadAndPlay(track: AudioTrack, fileUrl: string): Promise<void> {
    await this.loadInternal(track, fileUrl, true);
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
    this._isStopping = true;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.src = '';
    this.progressTracker.stopTracking();
    this.setState('idle');
    this._isStopping = false;
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

  onProgress(callback: (currentTime: number, duration: number) => void): () => void {
    return this.progressTracker.onProgress(callback);
  }

  onTrackEnd(callback: TrackEndCallback): () => void {
    this.trackEndListeners.add(callback);
    return () => this.trackEndListeners.delete(callback);
  }

  private setState(newState: PlaybackState): void {
    this.state = newState;
    [...this.stateListeners].forEach(cb => cb(newState));
  }

  preloadTrack(track: AudioTrack, fileUrl: string): void {
    if (this.preloadedTrack?.id === track.id) return;

    this.clearPreload();

    this.preloadAudio = new Audio();
    this.preloadAudio.preload = 'auto';
    this.preloadAudio.src = fileUrl;
    this.preloadAudio.load();
    this.preloadedTrack = track;
  }

  getPreloadedTrack(): AudioTrack | null {
    return this.preloadedTrack;
  }

  clearPreload(): void {
    if (this.preloadAudio) {
      this.preloadAudio.pause();
      this.preloadAudio.src = '';
      this.preloadAudio = null;
    }
    this.preloadedTrack = null;
  }

  destroy(): void {
    this.stop();
    this.clearPreload();
    this.progressTracker.destroy();
    this.stateListeners.clear();
    this.trackEndListeners.clear();
  }
}
