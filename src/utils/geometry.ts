import type { OverlayRect } from '../types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampOverlay(rect: OverlayRect, boundsWidth: number, boundsHeight: number): OverlayRect {
  return {
    ...rect,
    x: clamp(rect.x, 0, Math.max(0, boundsWidth - rect.width)),
    y: clamp(rect.y, 0, Math.max(0, boundsHeight - rect.height)),
  };
}

export function pointInRect(x: number, y: number, rect: OverlayRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
