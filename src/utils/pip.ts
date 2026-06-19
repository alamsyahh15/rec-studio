export type PipMode = 'live' | 'result';

export interface PipCapability {
  pictureInPictureEnabled: boolean;
  hasRequestMethod: boolean;
}

export function canUsePictureInPicture(capability: PipCapability): boolean {
  return capability.pictureInPictureEnabled && capability.hasRequestMethod;
}

export function getPipButtonLabel(mode: PipMode, active: boolean): string {
  if (mode === 'live') {
    return active ? 'Close Live PiP' : 'Live PiP';
  }

  return active ? 'Close Result PiP' : 'Open PiP';
}
