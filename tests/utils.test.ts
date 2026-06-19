import { describe, expect, it } from 'vitest';
import { clampOverlay, pointInRect } from '../src/utils/geometry';
import { formatBytes, formatDuration } from '../src/utils/format';
import { canUsePictureInPicture, getPipButtonLabel } from '../src/utils/pip';

describe('formatDuration', () => {
  it('merender waktu menjadi MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(61)).toBe('01:01');
    expect(formatDuration(3599)).toBe('59:59');
  });
});

describe('formatBytes', () => {
  it('mengubah byte menjadi label yang mudah dibaca', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.00 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('geometry helpers', () => {
  it('membatasi overlay tetap di dalam canvas', () => {
    expect(
      clampOverlay(
        {
          x: 900,
          y: -20,
          width: 180,
          height: 120,
        },
        960,
        540,
      ),
    ).toEqual({
      x: 780,
      y: 0,
      width: 180,
      height: 120,
    });
  });

  it('mendeteksi titik di dalam area overlay', () => {
    const rect = { x: 10, y: 12, width: 100, height: 60 };
    expect(pointInRect(50, 30, rect)).toBe(true);
    expect(pointInRect(120, 30, rect)).toBe(false);
  });
});

describe('picture in picture helpers', () => {
  it('mendeteksi dukungan PiP dari capability browser', () => {
    expect(
      canUsePictureInPicture({
        pictureInPictureEnabled: true,
        hasRequestMethod: true,
      }),
    ).toBe(true);

    expect(
      canUsePictureInPicture({
        pictureInPictureEnabled: true,
        hasRequestMethod: false,
      }),
    ).toBe(false);
  });

  it('menghasilkan label tombol PiP yang sesuai state', () => {
    expect(getPipButtonLabel('live', false)).toBe('Live PiP');
    expect(getPipButtonLabel('live', true)).toBe('Close Live PiP');
    expect(getPipButtonLabel('result', false)).toBe('Open PiP');
    expect(getPipButtonLabel('result', true)).toBe('Close Result PiP');
  });
});
