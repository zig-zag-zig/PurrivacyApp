import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { Keyboard } from 'react-native';

const GENERATOR_SETTINGS_OPEN_DELAY_MS = 120;

type UsePassphraseBannerActionsParams = {
    activeBannerTokenRef: MutableRefObject<string>;
    bannerAutoDismissTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    bannerAutoHiddenRef: MutableRefObject<boolean>;
    clearBannerFocusSettleTimeout: () => void;
    closingBannerRef: MutableRefObject<boolean>;
    dismissedBannerTokenRef: MutableRefObject<string | null>;
    generatorSettingsOpeningRef: MutableRefObject<boolean>;
    markBannerInteraction: () => void;
    setShowBanner: (visible: boolean) => void;
    setIsBannerPinned: (pinned: boolean) => void;
    setIsBannerReady: (ready: boolean) => void;
    setShowGeneratorSettingsModal: (visible: boolean) => void;
    settingsOpenTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    showBannerRef: MutableRefObject<boolean>;
    showGeneratorSettingsModal: boolean;
};

type UsePassphraseBannerActionsResult = {
    autoHideBanner: () => void;
    closeGeneratorSettings: () => void;
    dismissBanner: (dismissKeyboard?: boolean) => void;
    openGeneratorSettings: () => void;
};

/**
 * Extracted from usePassphraseFieldController (APP-ARCH-002) — the
 * cross-cutting banner actions that bridge the generator module (settings
 * open/close) and the banner lifecycle module (dismiss / auto-hide). All
 * inputs are refs or setters, so every callback is render-stable.
 */
export function usePassphraseBannerActions({
    activeBannerTokenRef,
    bannerAutoDismissTimeoutRef,
    bannerAutoHiddenRef,
    clearBannerFocusSettleTimeout,
    closingBannerRef,
    dismissedBannerTokenRef,
    generatorSettingsOpeningRef,
    markBannerInteraction,
    setShowBanner,
    setIsBannerPinned,
    setIsBannerReady,
    setShowGeneratorSettingsModal,
    settingsOpenTimeoutRef,
    showBannerRef,
    showGeneratorSettingsModal,
}: UsePassphraseBannerActionsParams): UsePassphraseBannerActionsResult {
    const closeGeneratorSettings = useCallback(() => {
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
            settingsOpenTimeoutRef.current = null;
        }
        generatorSettingsOpeningRef.current = false;
        setShowGeneratorSettingsModal(false);
        setIsBannerPinned(true);
    }, [settingsOpenTimeoutRef, generatorSettingsOpeningRef, setShowGeneratorSettingsModal, setIsBannerPinned]);

    const dismissBanner = useCallback((dismissKeyboard = true) => {
        if (!showBannerRef.current && !showGeneratorSettingsModal) return;

        dismissedBannerTokenRef.current = activeBannerTokenRef.current;
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
            settingsOpenTimeoutRef.current = null;
        }
        clearBannerFocusSettleTimeout();
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }

        closingBannerRef.current = true;
        showBannerRef.current = false;
        generatorSettingsOpeningRef.current = false;
        if (dismissKeyboard) {
            Keyboard.dismiss();
        }
        setShowBanner(false);
        setIsBannerPinned(false);
        closeGeneratorSettings();
        setIsBannerReady(false);
        setTimeout(() => {
            closingBannerRef.current = false;
        }, 180);
    }, [
        clearBannerFocusSettleTimeout,
        showGeneratorSettingsModal,
        settingsOpenTimeoutRef,
        activeBannerTokenRef,
        dismissedBannerTokenRef,
        bannerAutoDismissTimeoutRef,
        closingBannerRef,
        showBannerRef,
        generatorSettingsOpeningRef,
        setIsBannerPinned,
        setShowBanner,
        setIsBannerReady,
        closeGeneratorSettings,
    ]);

    const autoHideBanner = useCallback(() => {
        dismissedBannerTokenRef.current = activeBannerTokenRef.current;
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }
        bannerAutoHiddenRef.current = true;
        showBannerRef.current = false;
        setShowBanner(false);
        setIsBannerPinned(false);
    }, [
        activeBannerTokenRef,
        dismissedBannerTokenRef,
        bannerAutoDismissTimeoutRef,
        bannerAutoHiddenRef,
        showBannerRef,
        setShowBanner,
        setIsBannerPinned,
    ]);

    const openGeneratorSettings = useCallback(() => {
        markBannerInteraction();
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
        }
        generatorSettingsOpeningRef.current = true;
        setIsBannerPinned(true);
        Keyboard.dismiss();
        settingsOpenTimeoutRef.current = setTimeout(() => {
            settingsOpenTimeoutRef.current = null;
            setShowGeneratorSettingsModal(true);
        }, GENERATOR_SETTINGS_OPEN_DELAY_MS);
    }, [markBannerInteraction, settingsOpenTimeoutRef, generatorSettingsOpeningRef, setIsBannerPinned, setShowGeneratorSettingsModal]);

    return {
        autoHideBanner,
        closeGeneratorSettings,
        dismissBanner,
        openGeneratorSettings,
    };
}
