import { useCallback, useRef, useState } from 'react';

import { useToast } from '../../../app/state/ToastContext';
import type { AppRelease, UpdateDownloadProgress } from '../model/types';
import { UPDATE_COPY } from '../model/updateCopy';
import { AppUpdateNoReleaseError, appUpdateService } from '../services/appUpdateService';

/**
 * Maps update-service failures (check and install) to user-facing copy.
 * Extracted verbatim from UpdateContext.tsx (APP-ARCH-002).
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof AppUpdateNoReleaseError) {
        return UPDATE_COPY.noPublicRelease;
    }

    if (error instanceof Error && /allow app installs/i.test(error.message)) {
        return 'Allow app installs for Purrivacy, then try again.';
    }

    if (error instanceof Error && /update download was cancelled/i.test(error.message)) {
        return 'Update download was cancelled.';
    }

    if (error instanceof Error && /could not be verified|checksum does not match|size mismatch/i.test(error.message)) {
        return 'Update could not be verified and was not installed.';
    }

    return UPDATE_COPY.checkFailed;
}

type UseUpdateInstallResult = {
    canInstallUpdates: boolean;
    clearDownloadProgress: () => void;
    downloadProgress: UpdateDownloadProgress | null;
    installingRef: React.MutableRefObject<boolean>;
    installUpdate: (release: AppRelease | null) => Promise<void>;
    isInstalling: boolean;
};

/**
 * Update install orchestration (APP-ARCH-002): download progress state,
 * install calls, in-flight guard and permission gating. Extracted verbatim
 * from UpdateContext.tsx; the public context API is unchanged.
 */
export function useUpdateInstall(): UseUpdateInstallResult {
    const { showToast } = useToast();
    const [downloadProgress, setDownloadProgress] = useState<UpdateDownloadProgress | null>(null);
    const installingRef = useRef(false);
    const canInstallUpdates = appUpdateService.isInstallSupported();

    const installUpdate = useCallback(async (release: AppRelease | null) => {
        if (!release) return;
        if (installingRef.current) return;

        installingRef.current = true;
        try {
            await appUpdateService.downloadAndInstallUpdate(release, setDownloadProgress);
        } catch (caught) {
            const message = getErrorMessage(caught);
            showToast(message, 'error');
        } finally {
            installingRef.current = false;
            setDownloadProgress(null);
        }
    }, [showToast]);

    return {
        canInstallUpdates,
        clearDownloadProgress: () => setDownloadProgress(null),
        downloadProgress,
        installingRef,
        installUpdate,
        isInstalling: Boolean(downloadProgress),
    };
}
