import type { ProcessingStatus, RawRecording, RecordingResult } from './types';

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

type FFmpegInstance = {
  load: (options: { coreURL: string; wasmURL: string }) => Promise<boolean>;
  writeFile: (path: string, data: Uint8Array) => Promise<boolean>;
  exec: (args: string[]) => Promise<number>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile?: (path: string) => Promise<boolean>;
};

function createResult(blob: Blob, mimeType: string, fileName: string, usedFallback: boolean): RecordingResult {
  return {
    blob,
    mimeType,
    fileName,
    objectUrl: URL.createObjectURL(blob),
    sizeBytes: blob.size,
    usedFallback,
  };
}

export class FFmpegService {
  private ffmpeg: FFmpegInstance | null = null;
  private loaded = false;

  async processRecording(
    recording: RawRecording,
    onStatus?: (status: ProcessingStatus) => void,
  ): Promise<RecordingResult> {
    if (recording.mimeType.startsWith('video/mp4')) {
      return createResult(recording.blob, 'video/mp4', 'recording.mp4', false);
    }

    try {
      await this.load(onStatus);
      onStatus?.({ label: 'Processing video...', detail: 'Menulis source ke memori FFmpeg' });

      const inputName = 'input.webm';
      const outputName = 'output.mp4';
      const { fetchFile } = await import('@ffmpeg/util');
      await this.ffmpeg!.writeFile(inputName, await fetchFile(recording.blob));

      onStatus?.({ label: 'Processing video...', detail: 'Mencoba transcode ke H.264 + AAC' });
      try {
        await this.ffmpeg!.exec([
          '-i',
          inputName,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outputName,
        ]);
      } catch {
        onStatus?.({ label: 'Processing video...', detail: 'Transcode gagal, mencoba remux stream' });
        await this.ffmpeg!.exec([
          '-i',
          inputName,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          outputName,
        ]);
      }

      const data = await this.ffmpeg!.readFile(outputName);
      const outputBytes =
        data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(data);
      const outputBlob = new Blob([outputBytes], { type: 'video/mp4' });
      await this.cleanupFiles(inputName, outputName);
      return createResult(outputBlob, 'video/mp4', 'recording.mp4', false);
    } catch {
      return createResult(recording.blob, 'video/webm', 'recording.webm', true);
    }
  }

  private async load(onStatus?: (status: ProcessingStatus) => void): Promise<void> {
    if (this.loaded) {
      return;
    }

    onStatus?.({ label: 'Processing video...', detail: 'Memuat FFmpeg core ke browser' });
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    this.ffmpeg = ffmpeg;
    this.loaded = true;
  }

  private async cleanupFiles(...names: string[]): Promise<void> {
    const removable = this.ffmpeg;
    if (!removable?.deleteFile) {
      return;
    }

    for (const name of names) {
      try {
        await removable.deleteFile(name);
      } catch {
        // Ignore cleanup failures from virtual FS.
      }
    }
  }
}
