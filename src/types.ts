export type RecorderState =
  | 'idle'
  | 'requesting-permissions'
  | 'recording'
  | 'processing'
  | 'done';

export interface CaptureOptions {
  includeWebcam: boolean;
  includeMicrophone: boolean;
}

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveCapture {
  screenStream: MediaStream;
  webcamStream: MediaStream | null;
  microphoneEnabled: boolean;
}

export interface RawRecording {
  blob: Blob;
  mimeType: string;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  fileName: string;
  objectUrl: string;
  sizeBytes: number;
  usedFallback: boolean;
}

export interface ProcessingStatus {
  label: string;
  detail?: string;
}
