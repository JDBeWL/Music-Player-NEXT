import { NativeAudioPlayer } from './NativeAudioPlayer';
import { FFmpegAudioService } from './FFmpegService';
import type { AudioTrack, PlaybackState } from '@/types';
import { trackNeedsFFmpeg } from '@/types';

type StateChangeCallback = (state: PlaybackState) => void;
type ProgressCallback = (currentTime: number, duration: number) => void;
type TrackEndCallback = () => void;

class UnifiedAudioPlayer {
  private nativePlayer: NativeAudioPlayer;
  private ffmpegPlayer: FFmpegAudioService;
  private currentPlayer: 'native' | 'ffmpeg' | null = null;
  private currentTrack: AudioTrack | null = null;

  private stateListeners: Set<StateChangeCallback> = new Set();
  private progressListeners: Set<ProgressCallback> = new Set();
  private trackEndListeners: Set<TrackEndCallback> = new Set();

  private activeStateUnsub: (() => void) | null = null;
  private activeProgressUnsub: (() => void) | null = null;
  private activeTrackEndUnsub: (() => void) | null = null;

  constructor() {
    this.nativePlayer = new NativeAudioPlayer();
    this.ffmpegPlayer = new FFmpegAudioService();
  }

  private subscribeToActivePlayer(): void {
    this.unsubscribeFromActivePlayer();

    if (!this.currentPlayer) return;

    const player = this.currentPlayer === 'native' ? this.nativePlayer : this.ffmpegPlayer;

    this.activeStateUnsub = player.onStateChange((state) => {
      [...this.stateListeners].forEach(cb => cb(state));
    });

    this.activeProgressUnsub = player.onProgress((currentTime, duration) => {
      [...this.progressListeners].forEach(cb => cb(currentTime, duration));
    });

    this.activeTrackEndUnsub = player.onTrackEnd(() => {
      [...this.trackEndListeners].forEach(cb => cb());
    });
  }

  private unsubscribeFromActivePlayer(): void {
    this.activeStateUnsub?.();
    this.activeProgressUnsub?.();
    this.activeTrackEndUnsub?.();
    this.activeStateUnsub = null;
    this.activeProgressUnsub = null;
    this.activeTrackEndUnsub = null;
  }

  private async fetchAudioData(fileUrl: string): Promise<Uint8Array> {
    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  private async tryNativeWithFallback(
    track: AudioTrack,
    fileUrl: string,
    autoPlay: boolean
  ): Promise<void> {
    try {
      this.currentPlayer = 'native';
      this.subscribeToActivePlayer();

      if (autoPlay) {
        await this.nativePlayer.loadAndPlay(track, fileUrl);
      } else {
        await this.nativePlayer.load(track, fileUrl);
      }
    } catch (nativeError) {
      console.warn(
        `[UnifiedPlayer] Native playback failed for "${track.title}", falling back to FFmpeg:`,
        nativeError
      );

      this.nativePlayer.stop();

      try {
        const audioData = await this.fetchAudioData(fileUrl);
        this.currentPlayer = 'ffmpeg';
        this.subscribeToActivePlayer();

        if (autoPlay) {
          await this.ffmpegPlayer.loadAndPlay(track, audioData);
        } else {
          await this.ffmpegPlayer.load(track, audioData);
        }
      } catch (ffmpegError) {
        console.error(
          `[UnifiedPlayer] FFmpeg fallback also failed for "${track.title}":`,
          ffmpegError
        );
        throw ffmpegError;
      }
    }
  }

  async loadAndPlay(track: AudioTrack, fileUrl: string, audioData?: Uint8Array): Promise<void> {
    this.stop();
    this.currentTrack = track;

    if (trackNeedsFFmpeg(track)) {
      this.currentPlayer = 'ffmpeg';
      this.subscribeToActivePlayer();

      if (!audioData) {
        throw new Error('Audio data required for FFmpeg conversion');
      }

      await this.ffmpegPlayer.loadAndPlay(track, audioData);
    } else {
      await this.tryNativeWithFallback(track, fileUrl, true);
    }
  }

  async load(track: AudioTrack, fileUrl: string, audioData?: Uint8Array): Promise<void> {
    this.stop();
    this.currentTrack = track;

    if (trackNeedsFFmpeg(track)) {
      this.currentPlayer = 'ffmpeg';
      this.subscribeToActivePlayer();

      if (!audioData) {
        throw new Error('Audio data required for FFmpeg conversion');
      }

      await this.ffmpegPlayer.load(track, audioData);
    } else {
      await this.tryNativeWithFallback(track, fileUrl, false);
    }
  }

  async preload(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    if (trackNeedsFFmpeg(track)) {
      await this.ffmpegPlayer.preloadTrack(track, audioData);
    }
  }

  preloadNative(track: AudioTrack, fileUrl: string): void {
    if (!trackNeedsFFmpeg(track)) {
      this.nativePlayer.preloadTrack(track, fileUrl);
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
    this.unsubscribeFromActivePlayer();
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

  async init(): Promise<void> {
    await this.ffmpegPlayer.init();
  }

  clearCache(): void {
    this.ffmpegPlayer.clearCache();
  }

  getCacheSize(): number {
    return this.ffmpegPlayer.getCacheSize();
  }

  async destroy(): Promise<void> {
    this.unsubscribeFromActivePlayer();
    this.stateListeners.clear();
    this.progressListeners.clear();
    this.trackEndListeners.clear();
    this.nativePlayer.destroy();
    await this.ffmpegPlayer.destroy();
  }
}

export const unifiedAudioPlayer = new UnifiedAudioPlayer();
export { UnifiedAudioPlayer };
