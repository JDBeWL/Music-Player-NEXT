import type { AudioTrack, PlaybackState } from '@/types';
import { trackNeedsFFmpeg, getAudioFormat } from '@/types';
import { ProgressTracker } from './ProgressTracker';

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

type StateChangeCallback = (state: PlaybackState) => void;
type TrackEndCallback = () => void;

interface CachedAudio {
  buffer: AudioBuffer;
  size: number;
}

interface ConvertCompleteData {
  trackId: string;
  audioData: Uint8Array;
}

interface ProgressData {
  progress: number;
}

interface WorkerResponse {
  type: 'init-complete' | 'convert-complete' | 'error' | 'progress';
  data?: ConvertCompleteData | ProgressData;
  error?: string;
}

class FFmpegAudioService {
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;

  private state: PlaybackState = 'idle';
  private startTime = 0;
  private pauseTime = 0;
  private currentTrack: AudioTrack | null = null;
  private isInitialized = false;
  private isInitializing = false;

  private audioCache: Map<string, CachedAudio> = new Map();
  private cacheMemoryBytes = 0;
  private readonly MAX_CACHE_MEMORY_MB = 256;
  private readonly MAX_CACHE_MEMORY_BYTES = this.MAX_CACHE_MEMORY_MB * 1024 * 1024;
  private readonly MAX_CACHE_ENTRIES = 5;

  private stateListeners: Set<StateChangeCallback> = new Set();
  private trackEndListeners: Set<TrackEndCallback> = new Set();
  private progressTracker: ProgressTracker;

  private conversionPromises: Map<string, { resolve: (data: Uint8Array) => void; reject: (error: Error) => void }> = new Map();

  constructor() {
    this.progressTracker = new ProgressTracker(
      () => this.getCurrentTime(),
      () => this.getDuration(),
      () => {
        if (this.state === 'playing') {
          this.progressTracker.startTracking();
        }
      }
    );
  }

  async init(): Promise<void> {
    if (this.isInitialized && this.audioContext) return;
    if (this.isInitializing) return;

    this.isInitializing = true;

    try {
      this.worker = new Worker(new URL('../../workers/ffmpeg.worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(e.data);
      };

      this.worker.onerror = (error) => {
        console.error('[FFmpeg] Worker error:', error);
      };

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 30000);

        const handler = (e: MessageEvent<WorkerResponse>) => {
          if (e.data.type === 'init-complete') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'error') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };

        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({ type: 'init' });
      });

      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.5;
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  private handleWorkerMessage(response: WorkerResponse): void {
    switch (response.type) {
      case 'convert-complete':
        if (response.data && 'trackId' in response.data) {
          const { trackId, audioData } = response.data;
          const promise = this.conversionPromises.get(trackId);
          if (promise) {
            promise.resolve(new Uint8Array(audioData));
            this.conversionPromises.delete(trackId);
          }
        }
        break;

      case 'error':
        console.error('[FFmpeg] Worker error:', response.error);
        this.conversionPromises.forEach(p => p.reject(new Error(response.error)));
        this.conversionPromises.clear();
        break;

      case 'progress':
        break;
    }
  }

  private async convertAudioInWorker(audioData: Uint8Array, extension: string, trackId: string, sampleRate?: number): Promise<Uint8Array> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const transferBuffer = audioData.byteOffset === 0 && audioData.byteLength === audioData.buffer.byteLength
      ? audioData.buffer
      : audioData.slice().buffer;

    return new Promise<Uint8Array>((resolve, reject) => {
      this.conversionPromises.set(trackId, { resolve, reject });

      this.worker!.postMessage({
        type: 'convert',
        data: { audioData, extension, trackId, sampleRate }
      }, [transferBuffer]);
    });
  }

  private setState(newState: PlaybackState) {
    this.state = newState;
    [...this.stateListeners].forEach(cb => cb(newState));
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentTrack(): AudioTrack | null {
    return this.currentTrack;
  }

  getCurrentTime(): number {
    if (!this.audioContext || this.state !== 'playing') {
      return this.pauseTime;
    }
    return this.audioContext.currentTime - this.startTime + this.pauseTime;
  }

  getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
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

  private getAudioBufferSize(buffer: AudioBuffer): number {
    return buffer.numberOfChannels * buffer.length * 4;
  }

  private evictCacheIfNeeded(requiredBytes: number): void {
    const targetBytes = this.MAX_CACHE_MEMORY_BYTES - requiredBytes;

    while (this.audioCache.size > 0 && (this.cacheMemoryBytes > targetBytes || this.audioCache.size >= this.MAX_CACHE_ENTRIES)) {
      const firstKey = this.audioCache.keys().next().value;
      if (firstKey == null) break;
      const cached = this.audioCache.get(firstKey);
      if (cached) {
        this.cacheMemoryBytes -= cached.size;
      }
      this.audioCache.delete(firstKey);
    }
  }

  private getCachedAudio(trackId: string): AudioBuffer | null {
    const cached = this.audioCache.get(trackId);
    if (cached) {
      this.audioCache.delete(trackId);
      this.audioCache.set(trackId, cached);
      return cached.buffer;
    }
    return null;
  }

  private cacheAudio(trackId: string, buffer: AudioBuffer): void {
    const size = this.getAudioBufferSize(buffer);
    this.evictCacheIfNeeded(size);

    const existing = this.audioCache.get(trackId);
    if (existing) {
      this.cacheMemoryBytes -= existing.size;
    }

    this.audioCache.set(trackId, {
      buffer,
      size,
    });
    this.cacheMemoryBytes += size;
  }

  async preloadTrack(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    if (this.audioCache.has(track.id)) {
      return;
    }

    try {
      await this.init();

      const extension = getAudioFormat(track);
      let arrayBuffer: ArrayBuffer;

      if (trackNeedsFFmpeg(track)) {
        const sampleRate = this.audioContext?.sampleRate;
        const convertedData = await this.convertAudioInWorker(audioData, extension, `preload_${track.id}`, sampleRate);
        arrayBuffer = toArrayBuffer(convertedData);
      } else {
        arrayBuffer = toArrayBuffer(audioData);
      }

      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.cacheAudio(track.id, buffer);
    } catch (error) {
      console.warn('[FFmpeg] Preload failed for:', track.title, error);
    }
  }

  private async loadInternal(track: AudioTrack, audioData: Uint8Array, autoPlay: boolean): Promise<void> {
    this.stop();
    this.setState('loading');
    this.currentTrack = track;

    try {
      const cachedBuffer = this.getCachedAudio(track.id);
      if (cachedBuffer) {
        this.audioBuffer = cachedBuffer;
        this.pauseTime = 0;
        if (autoPlay) {
          this.play();
        } else {
          this.progressTracker.notifyProgress(0, cachedBuffer.duration);
          this.setState('paused');
        }
        return;
      }

      await this.init();

      const extension = getAudioFormat(track);
      let arrayBuffer: ArrayBuffer;

      if (trackNeedsFFmpeg(track)) {
        const sampleRate = this.audioContext?.sampleRate;
        const convertedData = await this.convertAudioInWorker(audioData, extension, track.id, sampleRate);
        arrayBuffer = toArrayBuffer(convertedData);
      } else {
        arrayBuffer = toArrayBuffer(audioData);
      }

      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.cacheAudio(track.id, buffer);
      this.audioBuffer = buffer;
      this.pauseTime = 0;

      if (autoPlay) {
        this.play();
      } else {
        this.progressTracker.notifyProgress(0, buffer.duration);
        this.setState('paused');
      }
    } catch (error) {
      console.error('[FFmpeg] Failed to load audio:', error);
      this.setState('error');
      throw error;
    }
  }

  async load(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    return this.loadInternal(track, audioData, false);
  }

  async loadAndPlay(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    return this.loadInternal(track, audioData, true);
  }

  play(): void {
    if (!this.audioContext || !this.audioBuffer || !this.gainNode) {
      console.error('[FFmpeg] Cannot play: missing audio context, buffer or gain node');
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);

    this.sourceNode.onended = () => {
      if (this.state === 'playing') {
        this.pauseTime = 0;
        [...this.trackEndListeners].forEach(cb => cb());
      }
    };

    this.startTime = this.audioContext.currentTime;
    this.sourceNode.start(0, this.pauseTime);
    this.setState('playing');

    this.progressTracker.startTracking();
  }

  pause(): void {
    if (this.state !== 'playing' || !this.audioContext) {
      return;
    }

    this.pauseTime = this.getCurrentTime();
    this.sourceNode?.stop();
    this.sourceNode = null;
    this.setState('paused');
    this.progressTracker.stopTracking();
  }

  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
      this.sourceNode = null;
    }
    this.pauseTime = 0;
    this.progressTracker.stopTracking();
    this.setState('idle');
  }

  seek(time: number): void {
    if (!this.audioBuffer) {
      return;
    }

    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.sourceNode?.stop();
      this.sourceNode = null;
    }

    this.pauseTime = Math.max(0, Math.min(time, this.getDuration()));

    if (wasPlaying) {
      this.play();
    }
  }

  setVolume(value: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  getVolume(): number {
    return this.gainNode?.gain.value ?? 1;
  }

  clearCache(): void {
    this.audioCache.clear();
    this.cacheMemoryBytes = 0;
  }

  getCacheSize(): number {
    return this.audioCache.size;
  }

  getCacheMemoryMB(): number {
    return this.cacheMemoryBytes / (1024 * 1024);
  }

  async destroy(): Promise<void> {
    this.stop();
    this.clearCache();
    this.progressTracker.destroy();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const ffmpegService = new FFmpegAudioService();
export { FFmpegAudioService };
