import { useCallback } from 'react';

import { getPassphraseStorageConsentHandler } from '../../../api/modalHandler';
import { securityService } from '../services/securityService';

const HANDLER_RETRY_DELAY_MS = 200;
const HANDLER_MAX_RETRIES = 5;

async function waitForConsentHandler(): Promise<(() => Promise<boolean>) | null> {
    for (let i = 0; i <= HANDLER_MAX_RETRIES; i++) {
        const handler = getPassphraseStorageConsentHandler();
        if (handler) return handler;
        if (i < HANDLER_MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, HANDLER_RETRY_DELAY_MS));
        }
    }
    return null;
}

export function usePassphraseStorageConsent(userId: string | null | undefined) {
    return useCallback(async (): Promise<boolean> => {
        if (!userId) return false;

        if (await securityService.isPassphraseStorageEnabled(userId)) {
            return true;
        }

        if (await securityService.hasAnsweredPassphraseStoragePrompt(userId)) {
            return false;
        }

        const handler = await waitForConsentHandler();
        const enabled = await (handler?.() ?? Promise.resolve(false));

        await securityService.setPassphraseStorageEnabled(userId, enabled);
        return enabled;
    }, [userId]);
}
