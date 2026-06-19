import type { OverlayRect } from './types';
import { clampOverlay, pointInRect } from './utils/geometry';

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = async () => {
      try {
        await video.play();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    video.onerror = () => reject(new Error('Gagal memuat video stream'));
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const capped = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + capped, y);
  ctx.lineTo(x + width - capped, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + capped);
  ctx.lineTo(x + width, y + height - capped);
  ctx.quadraticCurveTo(x + width, y + height, x + width - capped, y + height);
  ctx.lineTo(x + capped, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - capped);
  ctx.lineTo(x, y + capped);
  ctx.quadraticCurveTo(x, y, x + capped, y);
  ctx.closePath();
}

export class CanvasComposer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly screenVideo = document.createElement('video');
  private readonly webcamVideo = document.createElement('video');
  private animationFrameId = 0;
  private overlay: OverlayRect = { x: 0, y: 0, width: 0, height: 0 };
  private webcamVisible = true;
  private dragging = false;
  private dragOffset = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D tidak tersedia');
    }

    this.canvas = canvas;
    this.ctx = context;
    this.screenVideo.muted = true;
    this.screenVideo.playsInline = true;
    this.webcamVideo.muted = true;
    this.webcamVideo.playsInline = true;
    this.attachDragHandlers();
    this.drawIdleFrame();
  }

  async start(screenStream: MediaStream, webcamStream: MediaStream | null): Promise<void> {
    this.stopRenderLoop();
    this.screenVideo.srcObject = screenStream;
    await waitForVideo(this.screenVideo);

    const { width, height } = this.resolveCanvasSize(screenStream);
    this.canvas.width = width;
    this.canvas.height = height;

    if (webcamStream) {
      await this.setWebcamStream(webcamStream);
      this.webcamVisible = true;
    } else {
      this.webcamVideo.srcObject = null;
      this.webcamVisible = false;
    }

    this.resetOverlay();
    this.render();
  }

  async setWebcamStream(stream: MediaStream | null): Promise<void> {
    if (!stream) {
      this.webcamVideo.srcObject = null;
      this.webcamVisible = false;
      return;
    }

    this.webcamVideo.srcObject = stream;
    await waitForVideo(this.webcamVideo);
    this.resetOverlay();
    this.webcamVisible = true;
  }

  setWebcamVisible(visible: boolean): void {
    this.webcamVisible = visible;
  }

  captureStream(frameRate = 30): MediaStream {
    return this.canvas.captureStream(frameRate);
  }

  stop(): void {
    this.stopRenderLoop();
    this.drawIdleFrame('Rekaman selesai. Siap untuk take berikutnya.');
  }

  dispose(): void {
    this.stop();
    this.screenVideo.pause();
    this.webcamVideo.pause();
    this.screenVideo.srcObject = null;
    this.webcamVideo.srcObject = null;
  }

  private resolveCanvasSize(stream: MediaStream): { width: number; height: number } {
    const settings = stream.getVideoTracks()[0]?.getSettings();
    const width = typeof settings?.width === 'number' ? settings.width : 1280;
    const height = typeof settings?.height === 'number' ? settings.height : 720;
    const scale = Math.min(1, 1920 / width, 1080 / height);
    return {
      width: Math.max(640, Math.round(width * scale)),
      height: Math.max(360, Math.round(height * scale)),
    };
  }

  private render = (): void => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawScreen();
    this.drawFrameDetails();
    if (this.webcamVisible && this.webcamVideo.srcObject) {
      this.drawWebcamOverlay();
    }
    this.animationFrameId = window.requestAnimationFrame(this.render);
  };

  private drawScreen(): void {
    const sourceWidth = this.screenVideo.videoWidth || this.canvas.width;
    const sourceHeight = this.screenVideo.videoHeight || this.canvas.height;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = this.canvas.width / this.canvas.height;

    let drawWidth = this.canvas.width;
    let drawHeight = this.canvas.height;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceRatio > targetRatio) {
      drawWidth = this.canvas.height * sourceRatio;
      offsetX = (this.canvas.width - drawWidth) / 2;
    } else {
      drawHeight = this.canvas.width / sourceRatio;
      offsetY = (this.canvas.height - drawHeight) / 2;
    }

    this.ctx.drawImage(this.screenVideo, offsetX, offsetY, drawWidth, drawHeight);
  }

  private drawFrameDetails(): void {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(8, 11, 14, 0.18)';
    for (let index = 0; index < this.canvas.height; index += 4) {
      this.ctx.fillRect(0, index, this.canvas.width, 1);
    }
    this.ctx.restore();
  }

  private drawWebcamOverlay(): void {
    const { x, y, width, height } = this.overlay;

    this.ctx.save();
    drawRoundedRect(this.ctx, x, y, width, height, 30);
    this.ctx.clip();
    this.ctx.drawImage(this.webcamVideo, x, y, width, height);
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = 'rgba(255, 77, 90, 0.35)';
    this.ctx.shadowBlur = 24;
    drawRoundedRect(this.ctx, x, y, width, height, 30);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private resetOverlay(): void {
    const videoWidth = this.webcamVideo.videoWidth || 1280;
    const videoHeight = this.webcamVideo.videoHeight || 720;
    const targetWidth = Math.min(240, this.canvas.width * 0.22);
    const targetHeight = targetWidth * (videoHeight / videoWidth);
    this.overlay = {
      width: targetWidth,
      height: targetHeight,
      x: this.canvas.width - targetWidth - 32,
      y: this.canvas.height - targetHeight - 32,
    };
  }

  private drawIdleFrame(message = 'Preview akan muncul setelah screen capture dimulai.'): void {
    const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
    gradient.addColorStop(0, '#15161A');
    gradient.addColorStop(1, '#090A0D');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    this.ctx.strokeRect(12, 12, this.canvas.width - 24, this.canvas.height - 24);

    this.ctx.fillStyle = '#F5F7FA';
    this.ctx.font = '600 28px ui-monospace, SFMono-Regular, Menlo, monospace';
    this.ctx.fillText('RECSTUDIO', 40, 64);
    this.ctx.fillStyle = 'rgba(245,247,250,0.75)';
    this.ctx.font = '400 18px system-ui, sans-serif';
    this.ctx.fillText(message, 40, 102);
  }

  private attachDragHandlers(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.webcamVisible) {
        return;
      }

      const point = this.getCanvasPoint(event);
      if (!pointInRect(point.x, point.y, this.overlay)) {
        return;
      }

      this.dragging = true;
      this.dragOffset = {
        x: point.x - this.overlay.x,
        y: point.y - this.overlay.y,
      };
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) {
        return;
      }

      const point = this.getCanvasPoint(event);
      this.overlay = clampOverlay(
        {
          ...this.overlay,
          x: point.x - this.dragOffset.x,
          y: point.y - this.dragOffset.y,
        },
        this.canvas.width,
        this.canvas.height,
      );
    });

    const release = (event: PointerEvent) => {
      if (!this.dragging) {
        return;
      }
      this.dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }

  private getCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  private stopRenderLoop(): void {
    if (this.animationFrameId) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }
}
