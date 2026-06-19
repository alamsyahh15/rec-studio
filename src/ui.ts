import type { RecorderState, RecordingResult } from './types';
import { formatBytes } from './utils/format';

type NoticeTone = 'info' | 'warning' | 'error';

function buildAppMarkup(): string {
  return `
    <main class="app-shell">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Studio recorder</p>
          <div class="hero-heading">
            <h1>RecStudio</h1>
            <span class="state-pill" id="state-pill">Idle</span>
          </div>
          <p class="hero-description">
            Rekam layar, webcam, dan mikrofon dalam satu alur. Hasil akhir diproses menjadi MP4
            langsung di browser.
          </p>
        </div>
        <div class="hero-metrics">
          <div class="metric-card">
            <span class="metric-label">Mode</span>
            <strong class="metric-value" id="recording-mode">Screen + Webcam</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">Status</span>
            <strong class="metric-value" id="status-text">Siap merekam</strong>
          </div>
        </div>
      </section>

      <section class="studio-panel">
        <div class="preview-frame">
          <canvas id="preview-canvas" width="1280" height="720" aria-label="Preview rekaman live"></canvas>
          <div class="preview-overlay" id="processing-overlay" hidden>
            <div class="spinner" aria-hidden="true"></div>
            <strong id="processing-title">Processing video...</strong>
            <span id="processing-detail">Menyiapkan FFmpeg.wasm</span>
          </div>
          <div class="preview-badge">
            <span class="live-dot" id="live-dot"></span>
            <span id="timer-text">00:00</span>
          </div>
        </div>

        <div class="control-bar">
          <button class="record-button" id="record-button" type="button">
            <span class="record-dot"></span>
            <span id="record-button-label">Start Recording</span>
          </button>

          <button class="toggle-button is-active" id="webcam-toggle" type="button" aria-pressed="true">
            Webcam
          </button>

          <button class="toggle-button is-active" id="mic-toggle" type="button" aria-pressed="true">
            Mic
          </button>

          <div class="meter-block" aria-live="polite">
            <span class="meter-label">Level</span>
            <div class="meter-track">
              <span class="meter-fill" id="meter-fill"></span>
            </div>
          </div>
        </div>

        <div class="preview-hint">
          Drag overlay webcam langsung di canvas. Toggle webcam dan mic tetap bisa diubah saat merekam.
        </div>
      </section>

      <section class="result-panel" id="result-panel" hidden>
        <div class="result-header">
          <div>
            <p class="eyebrow">Hasil rekaman</p>
            <h2>Preview ekspor</h2>
          </div>
          <div class="result-meta">
            <span id="result-format">MP4</span>
            <span id="result-size">0 MB</span>
          </div>
        </div>
        <video id="result-video" class="result-video" controls autoplay playsinline></video>
        <div class="result-actions">
          <a class="download-button" id="download-link" download="recording.mp4">Download MP4</a>
        </div>
      </section>

      <div class="toast-region" id="toast-region" aria-live="polite"></div>
    </main>
  `;
}

export class UIController {
  readonly previewCanvas: HTMLCanvasElement;
  private readonly statePill: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly modeText: HTMLElement;
  private readonly timerText: HTMLElement;
  private readonly recordButton: HTMLButtonElement;
  private readonly recordButtonLabel: HTMLElement;
  private readonly webcamToggle: HTMLButtonElement;
  private readonly micToggle: HTMLButtonElement;
  private readonly meterFill: HTMLElement;
  private readonly processingOverlay: HTMLElement;
  private readonly processingTitle: HTMLElement;
  private readonly processingDetail: HTMLElement;
  private readonly liveDot: HTMLElement;
  private readonly resultPanel: HTMLElement;
  private readonly resultVideo: HTMLVideoElement;
  private readonly resultSize: HTMLElement;
  private readonly resultFormat: HTMLElement;
  private readonly downloadLink: HTMLAnchorElement;
  private readonly toastRegion: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = buildAppMarkup();

    this.previewCanvas = this.requireElement<HTMLCanvasElement>('preview-canvas');
    this.statePill = this.requireElement('state-pill');
    this.statusText = this.requireElement('status-text');
    this.modeText = this.requireElement('recording-mode');
    this.timerText = this.requireElement('timer-text');
    this.recordButton = this.requireElement<HTMLButtonElement>('record-button');
    this.recordButtonLabel = this.requireElement('record-button-label');
    this.webcamToggle = this.requireElement<HTMLButtonElement>('webcam-toggle');
    this.micToggle = this.requireElement<HTMLButtonElement>('mic-toggle');
    this.meterFill = this.requireElement('meter-fill');
    this.processingOverlay = this.requireElement('processing-overlay');
    this.processingTitle = this.requireElement('processing-title');
    this.processingDetail = this.requireElement('processing-detail');
    this.liveDot = this.requireElement('live-dot');
    this.resultPanel = this.requireElement('result-panel');
    this.resultVideo = this.requireElement<HTMLVideoElement>('result-video');
    this.resultSize = this.requireElement('result-size');
    this.resultFormat = this.requireElement('result-format');
    this.downloadLink = this.requireElement<HTMLAnchorElement>('download-link');
    this.toastRegion = this.requireElement('toast-region');
  }

  get recordActionButton(): HTMLButtonElement {
    return this.recordButton;
  }

  get webcamButton(): HTMLButtonElement {
    return this.webcamToggle;
  }

  get micButton(): HTMLButtonElement {
    return this.micToggle;
  }

  isWebcamEnabled(): boolean {
    return this.webcamToggle.classList.contains('is-active');
  }

  isMicrophoneEnabled(): boolean {
    return this.micToggle.classList.contains('is-active');
  }

  setWebcamEnabled(enabled: boolean): void {
    this.syncToggle(this.webcamToggle, enabled);
    this.refreshModeLabel();
  }

  setMicrophoneEnabled(enabled: boolean): void {
    this.syncToggle(this.micToggle, enabled);
    this.refreshModeLabel();
  }

  setControlsLocked(locked: boolean): void {
    this.webcamToggle.disabled = locked;
    this.micToggle.disabled = locked;
  }

  setState(state: RecorderState, message: string): void {
    this.statePill.textContent = state.replace('-', ' ');
    this.statePill.dataset.state = state;
    this.statusText.textContent = message;
    this.recordButton.dataset.state = state;
    this.liveDot.classList.toggle('is-live', state === 'recording');

    if (state === 'recording') {
      this.recordButtonLabel.textContent = 'Stop Recording';
      this.recordButton.classList.add('is-recording');
      this.recordButton.disabled = false;
      return;
    }

    this.recordButton.classList.remove('is-recording');
    this.recordButtonLabel.textContent =
      state === 'requesting-permissions' ? 'Requesting Access...' : 'Start Recording';
    this.recordButton.disabled = state === 'requesting-permissions' || state === 'processing';
  }

  setTimer(text: string): void {
    this.timerText.textContent = text;
  }

  updateVolume(level: number): void {
    const scaled = Math.round(Math.max(0, Math.min(1, level)) * 100);
    this.meterFill.style.width = `${scaled}%`;
  }

  setProcessing(visible: boolean, title = 'Processing video...', detail = 'Menyiapkan FFmpeg.wasm'): void {
    this.processingOverlay.hidden = !visible;
    this.processingTitle.textContent = title;
    this.processingDetail.textContent = detail;
  }

  showResult(result: RecordingResult): void {
    this.resultPanel.hidden = false;
    this.resultVideo.src = result.objectUrl;
    this.resultFormat.textContent = result.usedFallback ? 'Fallback' : 'MP4';
    this.resultSize.textContent = formatBytes(result.sizeBytes);
    this.downloadLink.href = result.objectUrl;
    this.downloadLink.download = result.fileName;
    this.downloadLink.textContent = result.usedFallback ? 'Download WebM Fallback' : 'Download MP4';
  }

  clearResult(): void {
    this.resultPanel.hidden = true;
    this.resultVideo.removeAttribute('src');
    this.resultVideo.load();
    this.downloadLink.removeAttribute('href');
  }

  showToast(message: string, tone: NoticeTone = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.textContent = message;
    this.toastRegion.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 220);
    }, 3400);
  }

  private refreshModeLabel(): void {
    const parts = ['Screen'];
    if (this.isWebcamEnabled()) {
      parts.push('Webcam');
    }
    if (this.isMicrophoneEnabled()) {
      parts.push('Mic');
    }
    this.modeText.textContent = parts.join(' + ');
  }

  private syncToggle(button: HTMLButtonElement, enabled: boolean): void {
    button.classList.toggle('is-active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }

  private requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Elemen #${id} tidak ditemukan`);
    }
    return element as T;
  }
}
