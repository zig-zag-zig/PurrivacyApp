import { useCallback, useRef } from 'react';

import { useModal } from '../../../app/state/ModalContext';
import { securityService } from '../services/securityService';

export function usePassphraseStorageConsent(userId: string | null | undefined) {
    const { showPassphraseStorageConsentModal } = useModal();
    const pendingRef = useRef(false);

    return useCallback(async (): Promise<boolean> => {
        if (!userId) return false;

        if (await securityService.isPassphraseStorageEnabled(userId)) {
            return true;
        }

        if (await securityService.hasAnsweredPassphraseStoragePrompt(userId)) {
            return false;
        }

        // Prevent duplicate modal calls if one is already pending
        if (pendingRef.current) {
            return false;
        }
        pendingRef.current = true;

        try {
            const enabled = await showPassphraseStorageConsentModal();
            await securityService.setPassphraseStorageEnabled(userId, enabled);
            await securityService.setPassphraseStoragePrompted(userId, true);
            return enabled;
        } finally {
            pendingRef.current = false;
        }
    }, [userId, showPassphraseStorageConsentModal]);
}
