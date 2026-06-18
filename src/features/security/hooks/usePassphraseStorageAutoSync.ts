import { useEffect, useRef } from 'react';
import type { UserDecrypted } from '../../../types/types';
import { getUserId } from '../../auth/domain/authUtils';
import { setPassphraseStorageEnabled } from '../services/passphraseStore';
import { logger } from '../../../utils/logger';

/**
 * Syncs the global passphrase storage setting on login / unlock.
 * Reads passphraseStorageEnabled from the decrypted user data
 * (included in the GET /user backend response) and applies it
 * locally without re-calling the backend API.
 *
 * Subsequent changes to the setting propagate via FCM and are
 * handled by usePassphraseSync.
 */
export function usePassphraseStorageAutoSync(userDecrypted: UserDecrypted | null): void {
    const lastAppliedUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!userDecrypted) return;

        const enabled = userDecrypted.passphraseStorageEnabled;
        if (typeof enabled !== 'boolean') return;

        try {
            const userId = getUserId();
            if (!userId) return;

            // Only apply once per user session to avoid redundant calls
            if (lastAppliedUserIdRef.current === userId) return;
            lastAppliedUserIdRef.current = userId;

            void setPassphraseStorageEnabled(userId, enabled, { skipRemoteSync: true });
        } catch (error) {
            logger.warn('failed to auto-sync passphrase storage setting on login', { error });
        }
    }, [userDecrypted]);
}
