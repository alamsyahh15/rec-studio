import type { ActiveCapture, CaptureOptions, RawRecording } from './types';

const SCREEN_DENIED_MESSAGE = 'Screen access was denied';

function chooseMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? 'video/webm';
}

export class RecorderService {
  private screenStream: MediaStream | null = null;
  private webcamStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private currentMimeType = chooseMimeType();

  async prepareCapture(options: CaptureOptions): Promise<ActiveCapture> {
    this.cleanupMediaTracks();
    this.screenStream = await this.requestScreenStream();
    await this.ensureAudioGraph();

    if (options.includeWebcam) {
      try {
        this.webcamStream = await this.ensureWebcamStream();
      } catch {
        this.webcamStream = null;
      }
    } else {
      this.webcamStream = null;
    }

    let microphoneEnabled = false;
    if (options.includeMicrophone) {
      try {
        microphoneEnabled = await this.enableMicrophone();
      } catch {
        microphoneEnabled = false;
      }
    } else {
      this.disableMicrophone();
    }

    return {
      screenStream: this.screenStream,
      webcamStream: this.webcamStream,
      microphoneEnabled,
    };
  }

  getScreenVideoTrack(): MediaStreamTrack | null {
    return this.screenStream?.getVideoTracks()[0] ?? null;
  }

  async ensureWebcamStream(): Promise<MediaStream> {
    if (this.webcamStream) {
      return this.webcamStream;
    }

    this.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: false,
    });

    return this.webcamStream;
  }

  async enableMicrophone(): Promise<boolean> {
    await this.ensureAudioGraph();

    if (!this.microphoneStream) {
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    }

    if (!this.micSourceNode || !this.micGainNode || !this.analyserNode) {
      this.micSourceNode = this.audioContext!.createMediaStreamSource(this.microphoneStream);
      this.micGainNode = this.audioContext!.createGain();
      this.analyserNode = this.audioContext!.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.micSourceNode.connect(this.micGainNode);
      this.micGainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.destinationNode!);
    }

    this.micGainNode.gain.value = 1;
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
    return true;
  }

  disableMicrophone(): void {
    if (this.micGainNode) {
      this.micGainNode.gain.value = 0;
    }
  }

  getMicrophoneLevel(): number {
    if (!this.analyserNode || !this.micGainNode || this.micGainNode.gain.value === 0) {
      return 0;
    }

    const buffer = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(buffer);
    let total = 0;
    for (const sample of buffer) {
      const normalized = sample / 128 - 1;
      total += normalized * normalized;
    }
    return Math.min(1, Math.sqrt(total / buffer.length) * 3.5);
  }

  startRecording(canvasStream: MediaStream): void {
    if (!this.destinationNode) {
      throw new Error('Audio graph belum siap');
    }

    this.recordedChunks = [];
    this.currentMimeType = chooseMimeType();
    const outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...this.destinationNode.stream.getAudioTracks(),
    ]);

    this.mediaRecorder = new MediaRecorder(outputStream, {
      mimeType: this.currentMimeType,
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 192_000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000);
  }

  stopRecording(): Promise<RawRecording> {
    if (!this.mediaRecorder) {
      return Promise.reject(new Error('Recorder belum aktif'));
    }

    return new Promise<RawRecording>((resolve, reject) => {
      const recorder = this.mediaRecorder!;
      recorder.onerror = () => reject(new Error('Perekaman gagal diselesaikan'));
      recorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: this.currentMimeType });
        this.mediaRecorder = null;
        this.cleanupMediaTracks();
        resolve({ blob, mimeType: this.currentMimeType });
      };
      recorder.stop();
    });
  }

  async close(): Promise<void> {
    this.cleanupMediaTracks();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.destinationNode = null;
    this.analyserNode = null;
    this.micSourceNode = null;
    this.micGainNode = null;
  }

  private async ensureAudioGraph(): Promise<void> {
    if (this.audioContext && this.destinationNode) {
      return;
    }
    this.audioContext = new AudioContext();
    this.destinationNode = this.audioContext.createMediaStreamDestination();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  private async requestScreenStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new Error(SCREEN_DENIED_MESSAGE);
      }
      throw error;
    }
  }

  private cleanupMediaTracks(): void {
    for (const stream of [this.screenStream, this.webcamStream, this.microphoneStream]) {
      stream?.getTracks().forEach((track) => track.stop());
    }

    this.micSourceNode?.disconnect();
    this.micGainNode?.disconnect();
    this.analyserNode?.disconnect();
    this.screenStream = null;
    this.webcamStream = null;
    this.microphoneStream = null;
    this.micSourceNode = null;
    this.micGainNode = null;
    this.analyserNode = null;
  }
}

export { SCREEN_DENIED_MESSAGE, chooseMimeType };
