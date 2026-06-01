import { useCallback } from 'react';

import { getPassphraseStorageConsentHandler } from '../../../api/modalHandler';
import { securityService } from '../services/securityService';

export function usePassphraseStorageConsent(userId: string | null | undefined) {
    return useCallback(async (): Promise<boolean> => {
        if (!userId) return false;

        if (await securityService.isPassphraseStorageEnabled(userId)) {
            return true;
        }

        if (await securityService.hasAnsweredPassphraseStoragePrompt(userId)) {
            return false;
        }

        const enabled = await (getPassphraseStorageConsentHandler()?.() ?? Promise.resolve(false));

        await securityService.setPassphraseStorageEnabled(userId, enabled);
        return enabled;
    }, [userId]);
}
