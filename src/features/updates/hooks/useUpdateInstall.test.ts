import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockShowToast = vi.hoisted(() => vi.fn());
const mockIsInstallSupported = vi.hoisted(() => vi.fn(() => true));
const mockDownloadAndInstallUpdate = vi.hoisted(() => vi.fn());

// The hook is exercised without a React renderer (no react-dom/test-utils in
// this repo); provide pass-through implementations for the hooks it uses,
// with a call-order-keyed useState so state transitions are observable.
const reactState = vi.hoisted(() => {
    const values: Record<number, unknown> = {};
    let key = 0;
    return {
        beginMount: () => { key = 0; },
        reset: () => {
            key = 0;
            Object.keys(values).forEach(k => delete values[Number(k)]);
        },
        nextKey: () => key++,
        values,
    };
});

vi.mock('react', () => ({
    useCallback: (fn: unknown) => fn,
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
        const k = reactState.nextKey();
        reactState.values[k] = reactState.values[k] === undefined ? initial : reactState.values[k];
        const set = (value: unknown) => {
            reactState.values[k] = typeof value === 'function'
                ? (value as (prev: unknown) => unknown)(reactState.values[k])
                : value;
        };
        return [reactState.values[k], set];
    },
}));

vi.mock('../../../app/state/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../services/appUpdateService', () => {
    class AppUpdateNoReleaseError extends Error {
        constructor(message?: string) {
            super(message);
            this.name = 'AppUpdateNoReleaseError';
        }
    }

    return {
        AppUpdateNoReleaseError,
        appUpdateService: {
            isInstallSupported: mockIsInstallSupported,
            downloadAndInstallUpdate: mockDownloadAndInstallUpdate,
        },
    };
});

import { getErrorMessage, useUpdateInstall } from './useUpdateInstall';
import { UPDATE_COPY } from '../model/updateCopy';
import { AppUpdateNoReleaseError } from '../services/appUpdateService';
import type { AppRelease } from '../model/types';

const release = { tagName: 'v1.0.9', version: '1.0.9' } as AppRelease;
const progress = { progress: 0.5, bytesWritten: 512, contentLength: 1024 } as const;

function mount() {
    // Reuse the same useState slots on every mount so state persists across
    // mounts within a test (call order is deterministic per hook run).
    reactState.beginMount();
    return useUpdateInstall();
}

beforeEach(() => {
    vi.clearAllMocks();
    reactState.reset();
    mockIsInstallSupported.mockReturnValue(true);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useUpdateInstall', () => {
    it('reports the install-permission gate from the service', () => {
        mockIsInstallSupported.mockReturnValue(false);
        expect(mount().canInstallUpdates).toBe(false);
        expect(mockIsInstallSupported).toHaveBeenCalledTimes(1);
    });

    it('no-ops when no release is available', async () => {
        const hook = mount();
        await hook.installUpdate(null);

        expect(mockDownloadAndInstallUpdate).not.toHaveBeenCalled();
        expect(mount().isInstalling).toBe(false);
    });

    it('downloads and installs the release, surfacing progress', async () => {
        mockDownloadAndInstallUpdate.mockImplementation(async (_release: AppRelease, onProgress: (p: unknown) => void) => {
            onProgress(progress);
        });
        const hook = mount();
        await hook.installUpdate(release);

        expect(mockDownloadAndInstallUpdate).toHaveBeenCalledTimes(1);
        expect(mockDownloadAndInstallUpdate).toHaveBeenCalledWith(release, expect.any(Function));
        expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('isInstalling reflects an in-flight download', async () => {
        let resolveInstall: (() => void) | undefined;
        mockDownloadAndInstallUpdate.mockImplementation(
            (_release: AppRelease, onProgress: (p: unknown) => void) => {
                onProgress(progress);
                return new Promise<void>((resolve) => { resolveInstall = resolve; });
            },
        );
        const hook = mount();
        const pending = hook.installUpdate(release);

        expect(mount().isInstalling).toBe(true);
        expect(mount().downloadProgress).toEqual(progress);

        resolveInstall?.();
        await pending;

        expect(mount().isInstalling).toBe(false);
        expect(mount().downloadProgress).toBeNull();
    });

    it('guards against concurrent install attempts', async () => {
        let resolveInstall: (() => void) | undefined;
        mockDownloadAndInstallUpdate.mockImplementation(
            () => new Promise<void>((resolve) => { resolveInstall = resolve; }),
        );
        const hook = mount();
        const pending = hook.installUpdate(release);
        await hook.installUpdate(release);

        expect(mockDownloadAndInstallUpdate).toHaveBeenCalledTimes(1);

        resolveInstall?.();
        await pending;
    });

    it('maps install failures to a toast and clears progress', async () => {
        mockDownloadAndInstallUpdate.mockRejectedValue(new Error('Allow app installs from this source first'));
        const hook = mount();
        await hook.installUpdate(release);

        expect(mockShowToast).toHaveBeenCalledWith('Allow app installs for Purrivacy, then try again.', 'error');
        expect(mount().downloadProgress).toBeNull();
        expect(mount().isInstalling).toBe(false);
    });

    it('clearDownloadProgress resets progress state', async () => {
        let resolveInstall: (() => void) | undefined;
        mockDownloadAndInstallUpdate.mockImplementation(
            (_release: AppRelease, onProgress: (p: unknown) => void) => {
                onProgress(progress);
                return new Promise<void>((resolve) => { resolveInstall = resolve; });
            },
        );
        const hook = mount();
        const pending = hook.installUpdate(release);

        expect(mount().downloadProgress).toEqual(progress);
        hook.clearDownloadProgress();
        expect(mount().downloadProgress).toBeNull();

        resolveInstall?.();
        await pending;
    });
});

describe('getErrorMessage', () => {
    it('maps the missing-release error to the no-public-release copy', () => {
        expect(getErrorMessage(new AppUpdateNoReleaseError('nope'))).toBe(UPDATE_COPY.noPublicRelease);
    });

    it('maps install-permission errors to actionable copy', () => {
        expect(getErrorMessage(new Error('Allow app installs for Purrivacy'))).toBe(
            'Allow app installs for Purrivacy, then try again.',
        );
    });

    it('maps cancellation and verification errors to specific copy', () => {
        expect(getErrorMessage(new Error('update download was cancelled'))).toBe(
            'Update download was cancelled.',
        );
        expect(getErrorMessage(new Error('checksum does not match'))).toBe(
            'Update could not be verified and was not installed.',
        );
    });

    it('falls back to the generic failure copy', () => {
        expect(getErrorMessage(new Error('boom'))).toBe(UPDATE_COPY.checkFailed);
        expect(getErrorMessage('not an error')).toBe(UPDATE_COPY.checkFailed);
    });
});
