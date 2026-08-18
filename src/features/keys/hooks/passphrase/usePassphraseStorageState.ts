import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { User } from 'firebase/auth';

import { logger } from '../../../../utils/logger';
import { securityService } from '../../../security/services/securityService';
import type { PassphraseBannerMode } from '../../model/passphraseFieldTypes';

type UsePassphraseStorageStateParams = {
    bannerMode: PassphraseBannerMode;
    fingerprint?: string;
    user: User | null;
    storedPassphraseValue?: string | null;
    commitPassphraseRef: MutableRefObject<(text: string) => void>;
    currentValueRef: MutableRefObject<string>;
    userEditedRef: MutableRefObject<boolean>;
    storedDefaultAppliedRef: MutableRefObject<boolean>;
    previousFingerprintRef: MutableRefObject<string | undefined>;
};

type UsePassphraseStorageStateResult = {
    storedPassphrase: string | null;
    storageEnabled: boolean;
    loadStoredPassphrase: () => Promise<void>;
    setStoredPassphrase: React.Dispatch<React.SetStateAction<string | null>>;
    setStorageEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Extracted from usePassphraseFieldController — manages stored passphrase loading
 * and secure storage state synchronisation.
 */
export function usePassphraseStorageState({
    bannerMode,
    fingerprint,
    user,
    storedPassphraseValue,
    commitPassphraseRef,
    currentValueRef,
    userEditedRef,
    storedDefaultAppliedRef,
    previousFingerprintRef,
}: UsePassphraseStorageStateParams): UsePassphraseStorageStateResult {
    const [storedPassphrase, setStoredPassphrase] = useState<string | null>(null);
    const [storageEnabled, setStorageEnabled] = useState(false);

    const loadStoredPassphrase = useCallback(async () => {
        if (bannerMode !== 'stored' || !fingerprint || !user?.uid) {
            setStorageEnabled(false);
            setStoredPassphrase(null);
            return;
        }

        try {
            const enabled = await securityService.isPassphraseStorageEnabled(user.uid);
            setStorageEnabled(enabled);

            if (!enabled) {
                if (!userEditedRef.current && storedPassphrase && currentValueRef.current === storedPassphrase) {
                    commitPassphraseRef.current('');
                }
                setStoredPassphrase(null);
                setStorageEnabled(false);
                return;
            }

            const stored = storedPassphraseValue ?? null;
            setStoredPassphrase(stored);

            if (
                stored
                && !storedDefaultAppliedRef.current
                && !userEditedRef.current
                && currentValueRef.current.length === 0
            ) {
                commitPassphraseRef.current(stored);
            }
            storedDefaultAppliedRef.current = true;
        } catch (loadError) {
            logger.warn('passphrase autofill load failed', { error: loadError });
            setStoredPassphrase(null);
        }
        // NOTE: deps match the original — storedPassphrase is intentionally omitted
        // so the closure captures the value at creation time (original behaviour).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bannerMode, commitPassphraseRef, fingerprint, storedPassphraseValue, user?.uid]);

    useFocusEffect(
        useCallback(() => {
            if (bannerMode !== 'stored') return undefined;
            void loadStoredPassphrase();
            return undefined;
        }, [bannerMode, loadStoredPassphrase]),
    );

    useEffect(() => {
        if (bannerMode === 'stored') {
            void loadStoredPassphrase();
        }
    }, [bannerMode, loadStoredPassphrase]);

    useEffect(() => {
        if (bannerMode !== 'stored' || !fingerprint || !user?.uid) return;

        if (!storageEnabled) {
            setStoredPassphrase(null);
            return;
        }

        const stored = storedPassphraseValue ?? null;
        setStoredPassphrase(stored);

        if (
            stored
            && !userEditedRef.current
            && (currentValueRef.current.length === 0 || currentValueRef.current === storedPassphrase)
        ) {
            commitPassphraseRef.current(stored);
            storedDefaultAppliedRef.current = true;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bannerMode, fingerprint, storageEnabled, storedPassphraseValue, storedPassphrase, user?.uid]);

    return {
        storedPassphrase,
        storageEnabled,
        loadStoredPassphrase,
        setStoredPassphrase,
        setStorageEnabled,
    };
}
