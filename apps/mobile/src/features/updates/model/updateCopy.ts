import type { UpdateDownloadProgress, UpdateStatus } from './types';

type UpdateTone = 'error' | 'info' | 'primary' | 'success';

type UpdateStatusPresentation = {
  iconName: string;
  title: string;
  tone: UpdateTone;
};

export const UPDATE_COPY = {
  checkFailed: 'Could not check for updates.',
  checkUnavailable: 'Update checks are unavailable.',
  noPublicRelease: 'No public release was found for this app.',
  skipVersion: 'Skip this version',
} as const;

export function formatPublishedDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatBytes(value: number | null): string | null {
  if (!value || value <= 0) return null;

  const mb = value / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;

  return `${Math.round(value / 1024)} KB`;
}

export function getProgressLabel(progress: UpdateDownloadProgress | null): string {
  switch (progress?.stage) {
    case 'checking-permission':
      return 'Preparing installer';
    case 'downloading':
      return 'Downloading update';
    case 'opening-installer':
      return 'Opening installer';
    default:
      return 'Preparing update';
  }
}

export function getUpdateStatusPresentation(status: UpdateStatus): UpdateStatusPresentation {
  switch (status) {
    case 'available':
      return {
        iconName: 'system-update-alt',
        title: 'Update Available',
        tone: 'primary',
      };
    case 'current':
      return {
        iconName: 'check-circle',
        title: 'App Is Up To Date',
        tone: 'success',
      };
    case 'not_found':
      return {
        iconName: 'info-outline',
        title: 'No Public Release Found',
        tone: 'info',
      };
    case 'checking':
      return {
        iconName: 'refresh',
        title: 'Checking for Updates',
        tone: 'primary',
      };
    case 'error':
    case 'idle':
    default:
      return {
        iconName: 'error-outline',
        title: 'Update Check Failed',
        tone: 'error',
      };
  }
}
