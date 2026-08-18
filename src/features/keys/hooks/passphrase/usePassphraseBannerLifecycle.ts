import { useCallback, useEffect, useRef, useState } from 'react';

import { suppressNextPassphraseBannerDismiss } from '../../../../services/passphraseBannerEvents';
import type { PassphraseBannerMode } from '../../model/passphraseFieldTypes';

const BANNER_FOCUS_SETTLE_MS = 820;

type UsePassphraseBannerLifecycleParams = {
    bannerMode: PassphraseBannerMode;
    isFocused: boolean;
    showGeneratorSettingsModal: boolean;
    storedPassphrase: string | null;
    generatedPassphrase: string;
    currentValue: string;
    bannerToken: string;
    storageEnabled: boolean;
};

type UsePassphraseBannerLifecycleResult = {
    showBanner: boolean;
    isBannerReady: boolean;
    isBannerPinned: boolean;
    bannerInteractionRef: React.MutableRefObject<boolean>;
    closingBannerRef: React.MutableRefObject<boolean>;
    showBannerRef: React.MutableRefObject<boolean>;
    activeBannerTokenRef: React.MutableRefObject<string>;
    latestBannerTokenRef: React.MutableRefObject<string>;
    dismissedBannerTokenRef: React.MutableRefObject<string | null>;
    bannerAutoHiddenRef: React.MutableRefObject<boolean>;
    bannerAutoDismissTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    bannerFocusSettleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    scheduleBannerAfterFocusScroll: () => void;
    clearBannerFocusSettleTimeout: () => void;
    markBannerInteraction: () => void;
    setIsBannerPinned: React.Dispatch<React.SetStateAction<boolean>>;
    setShowBanner: React.Dispatch<React.SetStateAction<boolean>>;
    setIsBannerReady: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Extracted from usePassphraseFieldController — manages banner visibility,
 * focus-settle scheduling, and provides refs for cross-cutting dismiss/hide
 * logic that lives in the façade.
 */
export function usePassphraseBannerLifecycle({
    bannerMode,
    isFocused,
    showGeneratorSettingsModal,
    storedPassphrase,
    generatedPassphrase,
    currentValue,
    bannerToken,
    storageEnabled,
}: UsePassphraseBannerLifecycleParams): UsePassphraseBannerLifecycleResult {
    const [showBanner, setShowBanner] = useState(false);
    const [isBannerReady, setIsBannerReady] = useState(false);
    const [isBannerPinned, setIsBannerPinned] = useState(false);
    const bannerInteractionRef = useRef(false);
    const closingBannerRef = useRef(false);
    const bannerAutoHiddenRef = useRef(false);
    const showBannerRef = useRef(false);
    const activeBannerTokenRef = useRef('none');
    const latestBannerTokenRef = useRef('none');
    const dismissedBannerTokenRef = useRef<string | null>(null);
    const bannerAutoDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bannerFocusSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep refs in sync with render-cycle values
    showBannerRef.current = showBanner;
    activeBannerTokenRef.current = bannerToken;
    latestBannerTokenRef.current = bannerToken;

    const markBannerInteraction = useCallback(() => {
        bannerInteractionRef.current = true;
        setIsBannerPinned(true);
        suppressNextPassphraseBannerDismiss();
        setTimeout(() => {
            bannerInteractionRef.current = false;
        }, 250);
    }, []);

    const clearBannerFocusSettleTimeout = useCallback(() => {
        if (bannerFocusSettleTimeoutRef.current) {
            clearTimeout(bannerFocusSettleTimeoutRef.current);
            bannerFocusSettleTimeoutRef.current = null;
        }
    }, []);

    const scheduleBannerAfterFocusScroll = useCallback(() => {
        clearBannerFocusSettleTimeout();
        setIsBannerReady(false);
        bannerFocusSettleTimeoutRef.current = setTimeout(() => {
            bannerFocusSettleTimeoutRef.current = null;
            setIsBannerReady(true);
        }, BANNER_FOCUS_SETTLE_MS);
    }, [clearBannerFocusSettleTimeout]);

    // Banner visibility computation effect
    useEffect(() => {
        const shouldShowStoredBanner = bannerMode === 'stored'
            && isFocused
            && isBannerReady
            && storageEnabled
            && Boolean(storedPassphrase)
            && currentValue !== storedPassphrase;
        const shouldShowGenerateBanner = bannerMode === 'generate'
            && ((isFocused && isBannerReady) || showGeneratorSettingsModal || isBannerPinned);
        const shouldShow = shouldShowStoredBanner || shouldShowGenerateBanner;
        const wasDismissed = dismissedBannerTokenRef.current === bannerToken;
        const nextShowBanner = shouldShow && (!wasDismissed || showGeneratorSettingsModal);

        if (nextShowBanner) {
            bannerAutoHiddenRef.current = false;
            if (!showBanner) {
                setShowBanner(true);
            }
            return;
        }

        if (showBanner) {
            setShowBanner(false);
        }
    }, [
        bannerMode,
        bannerToken,
        currentValue,
        isBannerPinned,
        isBannerReady,
        isFocused,
        showBanner,
        showGeneratorSettingsModal,
        storageEnabled,
        storedPassphrase,
    ]);

    // Cleanup on unmount — clears banner-related timeouts only
    useEffect(() => () => {
        clearBannerFocusSettleTimeout();
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
        }
    }, [clearBannerFocusSettleTimeout]);

    return {
        showBanner,
        isBannerReady,
        isBannerPinned,
        bannerInteractionRef,
        closingBannerRef,
        showBannerRef,
        activeBannerTokenRef,
        latestBannerTokenRef,
        dismissedBannerTokenRef,
        bannerAutoHiddenRef,
        bannerAutoDismissTimeoutRef,
        bannerFocusSettleTimeoutRef,
        scheduleBannerAfterFocusScroll,
        clearBannerFocusSettleTimeout,
        markBannerInteraction,
        setIsBannerPinned,
        setShowBanner,
        setIsBannerReady,
    };
}
