import './style.css';
import { CanvasComposer } from './canvas';
import { FFmpegService } from './ffmpeg';
import { RecorderService, SCREEN_DENIED_MESSAGE } from './recorder';
import type { RecorderState, RecordingResult } from './types';
import { UIController } from './ui';
import { formatDuration } from './utils/format';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Root aplikasi tidak ditemukan');
}

const ui = new UIController(root);
const composer = new CanvasComposer(ui.previewCanvas);
const recorder = new RecorderService();
const ffmpeg = new FFmpegService();

let appState: RecorderState = 'idle';
let recordingStartedAt = 0;
let timerId = 0;
let meterId = 0;
let currentResult: RecordingResult | null = null;

function setAppState(state: RecorderState, message: string): void {
  appState = state;
  ui.setState(state, message);
}

function cleanupResult(): void {
  if (!currentResult) {
    return;
  }
  URL.revokeObjectURL(currentResult.objectUrl);
  currentResult = null;
}

function startMeters(): void {
  stopMeters();
  timerId = window.setInterval(() => {
    const elapsedSeconds = (Date.now() - recordingStartedAt) / 1000;
    ui.setTimer(formatDuration(elapsedSeconds));
  }, 250);
  meterId = window.setInterval(() => {
    ui.updateVolume(recorder.getMicrophoneLevel());
  }, 100);
}

function stopMeters(resetTimer = false): void {
  window.clearInterval(timerId);
  window.clearInterval(meterId);
  timerId = 0;
  meterId = 0;
  ui.updateVolume(0);
  if (resetTimer) {
    ui.setTimer('00:00');
  }
}

async function startRecording(): Promise<void> {
  if (
    typeof navigator.mediaDevices?.getDisplayMedia !== 'function' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function' ||
    typeof window.MediaRecorder === 'undefined'
  ) {
    ui.showToast('Browser ini belum mendukung semua API perekaman yang dibutuhkan.', 'error');
    return;
  }

  cleanupResult();
  ui.clearResult();
  ui.setProcessing(false);
  ui.setControlsLocked(true);
  setAppState('requesting-permissions', 'Meminta izin screen, webcam, dan mikrofon.');

  try {
    const capture = await recorder.prepareCapture({
      includeWebcam: ui.isWebcamEnabled(),
      includeMicrophone: ui.isMicrophoneEnabled(),
    });

    if (ui.isWebcamEnabled() && !capture.webcamStream) {
      ui.setWebcamEnabled(false);
      ui.showToast('Akses webcam ditolak. Rekaman dilanjutkan tanpa overlay webcam.', 'warning');
    }

    if (ui.isMicrophoneEnabled() && !capture.microphoneEnabled) {
      ui.setMicrophoneEnabled(false);
      ui.showToast('Akses mikrofon ditolak. Rekaman dilanjutkan tanpa audio mic.', 'warning');
    }

    await composer.start(capture.screenStream, capture.webcamStream);
    composer.setWebcamVisible(ui.isWebcamEnabled());
    recorder.startRecording(composer.captureStream(30));

    const screenTrack = recorder.getScreenVideoTrack();
    screenTrack?.addEventListener(
      'ended',
      () => {
        if (appState === 'recording') {
          void stopRecording(true);
        }
      },
      { once: true },
    );

    ui.setControlsLocked(false);
    recordingStartedAt = Date.now();
    startMeters();
    setAppState('recording', 'Sedang merekam layar ke canvas komposit.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memulai perekaman.';
    if (message === SCREEN_DENIED_MESSAGE) {
      ui.showToast('Screen access was denied', 'error');
    } else {
      ui.showToast(message, 'error');
    }
    await recorder.close();
    composer.stop();
    stopMeters(true);
    ui.setControlsLocked(false);
    setAppState('idle', 'Siap merekam');
  }
}

async function stopRecording(stoppedByScreenTrack = false): Promise<void> {
  if (appState !== 'recording') {
    return;
  }

  stopMeters();
  ui.setControlsLocked(true);
  ui.setProcessing(true, 'Processing video...', 'Mengumpulkan hasil rekaman');
  setAppState('processing', 'Memproses hasil rekaman agar siap diunduh.');

  try {
    const rawRecording = await recorder.stopRecording();
    composer.stop();
    cleanupResult();
    currentResult = await ffmpeg.processRecording(rawRecording, (status) => {
      ui.setProcessing(true, status.label, status.detail);
    });
    ui.showResult(currentResult);

    if (currentResult.usedFallback) {
      setAppState('done', 'FFmpeg gagal. File WebM fallback tetap siap diunduh.');
      ui.showToast('FFmpeg gagal mengonversi. File WebM mentah disediakan sebagai fallback.', 'warning');
    } else {
      setAppState('done', 'MP4 siap diunduh.');
    }

    if (stoppedByScreenTrack) {
      ui.showToast('Screen capture dihentikan dari browser. Rekaman tetap berhasil diselesaikan.', 'info');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menyelesaikan perekaman.';
    ui.showToast(message, 'error');
    setAppState('idle', 'Siap merekam');
  } finally {
    await recorder.close();
    ui.setProcessing(false);
    ui.setControlsLocked(false);
    ui.setTimer('00:00');
  }
}

async function handleWebcamToggle(): Promise<void> {
  const nextState = !ui.isWebcamEnabled();

  if (appState === 'recording' && nextState) {
    try {
      const webcamStream = await recorder.ensureWebcamStream();
      await composer.setWebcamStream(webcamStream);
      composer.setWebcamVisible(true);
      ui.setWebcamEnabled(true);
      return;
    } catch {
      ui.setWebcamEnabled(false);
      ui.showToast('Webcam tidak dapat diaktifkan saat ini.', 'warning');
      return;
    }
  }

  ui.setWebcamEnabled(nextState);
  if (appState === 'recording') {
    composer.setWebcamVisible(nextState);
  }
}

async function handleMicToggle(): Promise<void> {
  const nextState = !ui.isMicrophoneEnabled();

  if (appState === 'recording' && nextState) {
    try {
      await recorder.enableMicrophone();
      ui.setMicrophoneEnabled(true);
      return;
    } catch {
      ui.setMicrophoneEnabled(false);
      ui.showToast('Akses mikrofon ditolak. Rekaman tetap berjalan tanpa mic.', 'warning');
      return;
    }
  }

  if (appState === 'recording' && !nextState) {
    recorder.disableMicrophone();
  }

  ui.setMicrophoneEnabled(nextState);
}

ui.recordActionButton.addEventListener('click', () => {
  if (appState === 'recording') {
    void stopRecording();
    return;
  }
  if (appState === 'idle' || appState === 'done') {
    void startRecording();
  }
});

ui.webcamButton.addEventListener('click', () => {
  void handleWebcamToggle();
});

ui.micButton.addEventListener('click', () => {
  void handleMicToggle();
});

window.addEventListener('beforeunload', () => {
  cleanupResult();
  void recorder.close();
  composer.dispose();
});

setAppState('idle', 'Siap merekam');
