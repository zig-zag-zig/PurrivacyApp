import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import { suppressNextPassphraseBannerDismiss } from '../../../../services/passphraseBannerEvents';

type UsePassphraseAutofillParams = {
    commitPassphrase: (nextPassphrase: string) => void;
    dismissBanner: (dismissKeyboard?: boolean) => void;
    generatedPassphrase: string;
    markBannerInteraction: () => void;
    onGeneratedPassphrase?: (passphrase: string) => void;
    secureCopy: (text: string, options?: { sensitivity: 'high' }) => Promise<void>;
    storedPassphrase: string | null;
    userEditedRef: MutableRefObject<boolean>;
};

type UsePassphraseAutofillResult = {
    handleAutofill: () => void;
    handleCopyGeneratedPassphrase: () => void;
    handleGeneratedBannerPress: () => void;
};

/**
 * Extracted from usePassphraseFieldController (APP-ARCH-002) — the autofill /
 * generated-passphrase action handlers that bridge the value commit path with
 * the banner lifecycle (dismiss) and the secure clipboard.
 */
export function usePassphraseAutofill({
    commitPassphrase,
    dismissBanner,
    generatedPassphrase,
    markBannerInteraction,
    onGeneratedPassphrase,
    secureCopy,
    storedPassphrase,
    userEditedRef,
}: UsePassphraseAutofillParams): UsePassphraseAutofillResult {
    const handleAutofill = useCallback(() => {
        if (!storedPassphrase) return;
        suppressNextPassphraseBannerDismiss();
        commitPassphrase(storedPassphrase);
        dismissBanner();
    }, [commitPassphrase, dismissBanner, storedPassphrase]);

    const applyGeneratedPassphrase = useCallback(() => {
        if (!generatedPassphrase) return;
        userEditedRef.current = true;
        onGeneratedPassphrase?.(generatedPassphrase);
        if (!onGeneratedPassphrase) {
            commitPassphrase(generatedPassphrase);
        }
    }, [commitPassphrase, generatedPassphrase, onGeneratedPassphrase, userEditedRef]);

    const handleGeneratedBannerPress = useCallback(() => {
        suppressNextPassphraseBannerDismiss();
        applyGeneratedPassphrase();
        dismissBanner();
    }, [applyGeneratedPassphrase, dismissBanner]);

    const handleCopyGeneratedPassphrase = useCallback(() => {
        if (!generatedPassphrase) return;
        markBannerInteraction();
        void secureCopy(generatedPassphrase, { sensitivity: 'high' });
    }, [generatedPassphrase, markBannerInteraction, secureCopy]);

    return {
        handleAutofill,
        handleCopyGeneratedPassphrase,
        handleGeneratedBannerPress,
    };
}
