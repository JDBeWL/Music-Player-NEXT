export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioTrack {
  id: string;
  path: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  coverUrl?: string;
}

type StateChangeCallback = (state: PlaybackState) => void;
type ProgressCallback = (currentTime: number, duration: number) => void;
type TrackEndCallback = () => void;

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioBuffer: AudioBuffer | null = null;

  private state: PlaybackState = 'idle';
  private startTime = 0;
  private pauseTime = 0;
  private currentTrack: AudioTrack | null = null;

  private stateListeners: StateChangeCallback[] = [];
  private progressListeners: ProgressCallback[] = [];
  private trackEndListeners: TrackEndCallback[] = [];

  private progressInterval: number | null = null;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext() {
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;

    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);
  }

  private setState(newState: PlaybackState) {
    this.state = newState;
    this.stateListeners.forEach(cb => cb(newState));
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

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  onStateChange(callback: StateChangeCallback) {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter(cb => cb !== callback);
    };
  }

  onProgress(callback: ProgressCallback) {
    this.progressListeners.push(callback);
    return () => {
      this.progressListeners = this.progressListeners.filter(cb => cb !== callback);
    };
  }

  onTrackEnd(callback: TrackEndCallback) {
    this.trackEndListeners.push(callback);
    return () => {
      this.trackEndListeners = this.trackEndListeners.filter(cb => cb !== callback);
    };
  }

  async loadAudio(audioBlob: Blob, track: AudioTrack) {
    this.stop();
    this.setState('loading');
    this.currentTrack = track;

    try {
      if (!this.audioContext) {
        this.initAudioContext();
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      this.audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

      this.pauseTime = 0;
      this.setState('idle');
    } catch (error) {
      console.error('Failed to load audio:', error);
      this.setState('error');
      throw error;
    }
  }

  play() {
    if (!this.audioContext || !this.audioBuffer || !this.gainNode) {
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
        this.setState('idle');
        this.pauseTime = 0;
        this.trackEndListeners.forEach(cb => cb());
      }
    };

    this.startTime = this.audioContext.currentTime;
    this.sourceNode.start(0, this.pauseTime);
    this.setState('playing');

    this.startProgressTracking();
  }

  pause() {
    if (this.state !== 'playing' || !this.audioContext) {
      return;
    }

    this.pauseTime = this.getCurrentTime();
    this.sourceNode?.stop();
    this.sourceNode = null;
    this.setState('paused');
    this.stopProgressTracking();
  }

  stop() {
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode = null;
    }
    this.pauseTime = 0;
    this.stopProgressTracking();
    this.setState('idle');
  }

  seek(time: number) {
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

  setVolume(value: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  getVolume(): number {
    return this.gainNode?.gain.value ?? 1;
  }

  private startProgressTracking() {
    this.stopProgressTracking();
    this.progressInterval = window.setInterval(() => {
      this.progressListeners.forEach(cb => {
        cb(this.getCurrentTime(), this.getDuration());
      });
    }, 100);
  }

  private stopProgressTracking() {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  destroy() {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }
}

export const audioPlayer = new AudioPlayer();