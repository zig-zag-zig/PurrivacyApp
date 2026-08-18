import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import { suppressNextPassphraseBannerDismiss } from '../../../../services/passphraseBannerEvents';
import type { PassphraseBannerMode } from '../usePassphraseFieldController';

type UsePassphraseFieldFocusParams = {
    bannerMode: PassphraseBannerMode;
    bannerInteractionRef: MutableRefObject<boolean>;
    clearBannerFocusSettleTimeout: () => void;
    closingBannerRef: MutableRefObject<boolean>;
    dismissedBannerTokenRef: MutableRefObject<string | null>;
    generatedPassphrase: string;
    generatorSettingsOpeningRef: MutableRefObject<boolean>;
    loadStoredPassphrase: () => Promise<void>;
    regeneratePassphrase: () => Promise<void>;
    scheduleBannerAfterFocusScroll: () => void;
    setIsBannerPinned: (pinned: boolean) => void;
    setIsBannerReady: (ready: boolean) => void;
    setIsFocused: (focused: boolean) => void;
    showGeneratorSettingsModal: boolean;
};

type UsePassphraseFieldFocusResult = {
    handleBlur: () => void;
    handleFocus: () => void;
};

/**
 * Extracted from usePassphraseFieldController (APP-ARCH-002) — focus/blur
 * orchestration: banner re-arming on focus, stored-passphrase load and
 * generator kick-off, plus the blur rules (settings opening, banner
 * interaction, plain dismiss). The isFocused state itself stays in the facade
 * because the banner lifecycle module consumes it before handlers can be built.
 */
export function usePassphraseFieldFocus({
    bannerMode,
    bannerInteractionRef,
    clearBannerFocusSettleTimeout,
    closingBannerRef,
    dismissedBannerTokenRef,
    generatedPassphrase,
    generatorSettingsOpeningRef,
    loadStoredPassphrase,
    regeneratePassphrase,
    scheduleBannerAfterFocusScroll,
    setIsBannerPinned,
    setIsBannerReady,
    setIsFocused,
    showGeneratorSettingsModal,
}: UsePassphraseFieldFocusParams): UsePassphraseFieldFocusResult {
    const handleFocus = useCallback(() => {
        suppressNextPassphraseBannerDismiss();
        dismissedBannerTokenRef.current = null;
        closingBannerRef.current = false;
        setIsFocused(true);
        setIsBannerPinned(false);
        scheduleBannerAfterFocusScroll();

        if (bannerMode === 'stored') {
            void loadStoredPassphrase();
        }
        if (bannerMode === 'generate' && !generatedPassphrase) {
            void regeneratePassphrase();
        }
    }, [
        bannerMode,
        dismissedBannerTokenRef,
        closingBannerRef,
        setIsFocused,
        setIsBannerPinned,
        scheduleBannerAfterFocusScroll,
        loadStoredPassphrase,
        regeneratePassphrase,
        generatedPassphrase,
    ]);

    const handleBlur = useCallback(() => {
        if (generatorSettingsOpeningRef.current || showGeneratorSettingsModal) {
            setIsFocused(false);
            return;
        }

        if (bannerInteractionRef.current) {
            setIsFocused(false);
            setIsBannerPinned(true);
            return;
        }

        clearBannerFocusSettleTimeout();
        setIsBannerReady(false);
        setIsFocused(false);
        setIsBannerPinned(false);
    }, [
        generatorSettingsOpeningRef,
        showGeneratorSettingsModal,
        bannerInteractionRef,
        clearBannerFocusSettleTimeout,
        setIsBannerReady,
        setIsFocused,
        setIsBannerPinned,
    ]);

    return { handleBlur, handleFocus };
}
