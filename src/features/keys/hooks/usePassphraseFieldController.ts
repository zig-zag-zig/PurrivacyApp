import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import {
    subscribePassphraseBannerDismiss,
    suppressNextPassphraseBannerDismiss,
} from '../../../services/passphraseBannerEvents';
import { useAuth } from '../../auth/state/AuthContext';
import { useSecureCopy } from '../../../shared/hooks/useSecureCopy';
import {
    DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
} from '../../security/services/passphraseGeneratorSettings';
import type { PassphraseGeneratorSettings } from '../../security/services/passphraseGeneratorSettings';
import { usePassphraseBannerOverlay } from '../components/PassphraseBannerOverlay';
import { usePassphraseAutofill } from './passphrase/usePassphraseAutofill';
import { usePassphraseBannerActions } from './passphrase/usePassphraseBannerActions';
import { usePassphraseBannerLifecycle } from './passphrase/usePassphraseBannerLifecycle';
import { usePassphraseFieldFocus } from './passphrase/usePassphraseFieldFocus';
import { usePassphraseFieldValue } from './passphrase/usePassphraseFieldValue';
import { usePassphraseGeneratorSettings } from './passphrase/usePassphraseGeneratorSettings';
import { usePassphraseStorageState } from './passphrase/usePassphraseStorageState';

export type PassphraseBannerMode = 'stored' | 'generate' | 'none';

type UsePassphraseFieldControllerParams = {
    bannerMode?: PassphraseBannerMode;
    doNotUseAutofill?: boolean;
    fingerprint?: string;
    onGeneratedPassphrase?: (passphrase: string) => void;
    onPassphraseChange?: (passphrase: string) => void;
    testID?: string;
    value?: string;
    storedPassphraseValue?: string | null;
};

type UsePassphraseFieldControllerResult = {
    currentValue: string;
    generatorSettings: PassphraseGeneratorSettings;
    handleBlur: () => void;
    handleChangeText: (text: string) => void;
    handleFocus: () => void;
    handleInputWrapperRef: (node: View | null) => void;
    inputRef: RefObject<TextInput | null>;
    markBannerInteraction: () => void;
    onInputTouchStart: () => void;
    showGeneratorSettingsModal: boolean;
    adjustGeneratorLength: (delta: number) => void;
    closeGeneratorSettings: () => void;
    updateGeneratorSettings: (settings: PassphraseGeneratorSettings) => Promise<void>;
};

const BANNER_AUTO_DISMISS_MS = 3000;

/**
 * Façade (APP-ARCH-002) — owns the shared refs, the cross-module effects and
 * the public controller surface. Value state lives in usePassphraseFieldValue,
 * stored-passphrase sync in usePassphraseStorageState, generator settings in
 * usePassphraseGeneratorSettings, banner visibility in usePassphraseBannerLifecycle,
 * focus/blur in usePassphraseFieldFocus, autofill actions in usePassphraseAutofill
 * and cross-cutting dismiss/settings actions in usePassphraseBannerActions.
 */
export function usePassphraseFieldController({
    bannerMode: explicitBannerMode,
    doNotUseAutofill,
    fingerprint,
    onGeneratedPassphrase,
    onPassphraseChange,
    testID,
    value,
    storedPassphraseValue,
}: UsePassphraseFieldControllerParams): UsePassphraseFieldControllerResult {
    const { user } = useAuth();
    const { secureCopy } = useSecureCopy();
    const { hidePassphraseBanner, showPassphraseBanner } = usePassphraseBannerOverlay();
    const fieldId = useId();

    const bannerMode: PassphraseBannerMode = explicitBannerMode ?? (doNotUseAutofill ? 'none' : 'stored');

    // ── Shared state & refs (owned by facade) ───────────────────────────
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<TextInput | null>(null);
    const inputAnchorRef = useRef<View | null>(null);
    const userEditedRef = useRef(false);
    const storedDefaultAppliedRef = useRef(false);
    const previousFingerprintRef = useRef<string | undefined>(undefined);
    const generatorSettingsRef = useRef<PassphraseGeneratorSettings>(
        DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    );

    // ═══ Sub-module: value synchronization ══════════════════════════════
    const {
        currentValue,
        currentValueRef,
        commitPassphrase,
        commitPassphraseRef,
        onGeneratedPassphraseRef,
    } = usePassphraseFieldValue({
        value,
        onPassphraseChange,
        onGeneratedPassphrase,
    });

    // ═══ Sub-module: passphrase storage state ═══════════════════════════
    const {
        storedPassphrase,
        storageEnabled,
        loadStoredPassphrase,
    } = usePassphraseStorageState({
        bannerMode,
        fingerprint,
        user,
        storedPassphraseValue,
        commitPassphraseRef,
        currentValueRef,
        userEditedRef,
        storedDefaultAppliedRef,
        previousFingerprintRef,
    });

    // ═══ Sub-module: generator settings (called before banner lifecycle
    //      because banner lifecycle needs showGeneratorSettingsModal etc.) ══
    const {
        generatorSettings,
        generatedPassphrase,
        showGeneratorSettingsModal,
        setShowGeneratorSettingsModal,
        generatorSettingsOpeningRef,
        settingsOpenTimeoutRef,
        regeneratePassphrase,
        loadGeneratorSettings,
        updateGeneratorSettings,
        adjustGeneratorLength,
    } = usePassphraseGeneratorSettings({
        bannerMode,
        onGeneratedPassphrase,
        commitPassphraseRef,
        onGeneratedPassphraseRef,
        generatorSettingsRef,
    });

    generatorSettingsRef.current = generatorSettings;

    // ── bannerToken (computed after storage + generator modules so we can
    //      use storedPassphrase / generatedPassphrase, matching the original) ─
    const bannerToken = useMemo(() => {
        if (bannerMode === 'stored') {
            return `stored:${fieldId}:${fingerprint ?? ''}:${storedPassphrase ?? ''}:${currentValue}`;
        }

        if (bannerMode === 'generate') {
            return `generate:${fieldId}:${fingerprint ?? ''}:${generatedPassphrase}`;
        }

        return 'none';
    }, [bannerMode, currentValue, fieldId, fingerprint, generatedPassphrase, storedPassphrase]);

    // ═══ Sub-module: banner lifecycle ═══════════════════════════════════
    const {
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
    } = usePassphraseBannerLifecycle({
        bannerMode,
        isFocused,
        showGeneratorSettingsModal,
        storedPassphrase,
        generatedPassphrase,
        currentValue,
        bannerToken,
        storageEnabled,
    });

    // ═══ Sub-module: cross-cutting banner actions ═══════════════════════
    const {
        autoHideBanner,
        closeGeneratorSettings,
        dismissBanner,
        openGeneratorSettings,
    } = usePassphraseBannerActions({
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
    });

    // ═══ Sub-module: focus/blur orchestration ═══════════════════════════
    const { handleBlur, handleFocus } = usePassphraseFieldFocus({
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
    });

    // ═══ Sub-module: autofill / generated-passphrase actions ════════════
    const {
        handleAutofill,
        handleCopyGeneratedPassphrase,
        handleGeneratedBannerPress,
    } = usePassphraseAutofill({
        commitPassphrase,
        dismissBanner,
        generatedPassphrase,
        markBannerInteraction,
        onGeneratedPassphrase,
        secureCopy,
        storedPassphrase,
        userEditedRef,
    });

    // ═══ Event handlers kept in the facade (they bridge all modules) ════
    const handleChangeText = (text: string) => {
        userEditedRef.current = true;
        commitPassphrase(text);
        if (
            bannerMode === 'stored'
            && isFocused
            && storedPassphrase
            && text !== storedPassphrase
        ) {
            dismissedBannerTokenRef.current = null;
            if (!isBannerReady) {
                setIsBannerReady(true);
            }
        }
    };

    const handleInputWrapperRef = useCallback((node: View | null) => {
        inputAnchorRef.current = node;
    }, []);

    // ═══ Fingerprint-change effect ══════════════════════════════════════
    useEffect(() => {
        if (previousFingerprintRef.current !== fingerprint) {
            const hadPreviousFingerprint = previousFingerprintRef.current !== undefined;
            setShowBanner(false);
            setIsBannerReady(false);
            // storedPassphrase is cleared in the storage module's internal effect
            setShowGeneratorSettingsModal(false);
            setIsBannerPinned(false);
            clearBannerFocusSettleTimeout();
            storedDefaultAppliedRef.current = false;
            userEditedRef.current = false;

            if (hadPreviousFingerprint && value === undefined) {
                commitPassphrase('');
            }
            previousFingerprintRef.current = fingerprint;
        }
    }, [clearBannerFocusSettleTimeout, commitPassphrase, fingerprint, setShowGeneratorSettingsModal, setIsBannerPinned, setIsBannerReady, setShowBanner, value]);

    // ═══ Banner dismiss subscription ════════════════════════════════════
    useEffect(() => {
        return subscribePassphraseBannerDismiss(() => {
            if (showGeneratorSettingsModal) return;
            const passphraseInputStillFocused = inputRef.current?.isFocused?.() ?? false;
            dismissBanner(passphraseInputStillFocused);
        });
    }, [dismissBanner, inputRef, showGeneratorSettingsModal]);

    // ═══ Banner auto-dismiss timer ══════════════════════════════════════
    useEffect(() => {
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }

        if (!showBanner || showGeneratorSettingsModal) return undefined;

        bannerAutoDismissTimeoutRef.current = setTimeout(() => {
            autoHideBanner();
        }, BANNER_AUTO_DISMISS_MS);

        return () => {
            if (bannerAutoDismissTimeoutRef.current) {
                clearTimeout(bannerAutoDismissTimeoutRef.current);
                bannerAutoDismissTimeoutRef.current = null;
            }
        };
    }, [autoHideBanner, bannerToken, showBanner, showGeneratorSettingsModal]);

    // ═══ Banner rendering effect (bridges banner + generator + autofill) ══
    useEffect(() => {
        if (!showBanner || bannerMode === 'none' || bannerAutoHiddenRef.current) {
            hidePassphraseBanner(bannerToken);
            return undefined;
        }

        showPassphraseBanner({
            anchorRef: inputAnchorRef,
            generatedPassphrase,
            id: bannerToken,
            keyboardFallbackEnabled: isFocused && !showGeneratorSettingsModal,
            mode: bannerMode as 'stored' | 'generate',
            onCopy: handleCopyGeneratedPassphrase,
            onOpenSettings: openGeneratorSettings,
            onUse: bannerMode === 'stored' ? handleAutofill : handleGeneratedBannerPress,
            testID,
        });

        return () => {
            hidePassphraseBanner(bannerToken);
        };
    }, [
        bannerMode,
        bannerToken,
        generatedPassphrase,
        handleAutofill,
        handleCopyGeneratedPassphrase,
        handleGeneratedBannerPress,
        hidePassphraseBanner,
        isFocused,
        openGeneratorSettings,
        showBanner,
        showGeneratorSettingsModal,
        showPassphraseBanner,
        testID,
        bannerAutoHiddenRef,
    ]);

    // ═══ Cleanup on unmount ═════════════════════════════════════════════
    useEffect(() => () => {
        hidePassphraseBanner(latestBannerTokenRef.current);
        clearBannerFocusSettleTimeout();
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
        }
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
        }
    }, [clearBannerFocusSettleTimeout, hidePassphraseBanner, settingsOpenTimeoutRef, bannerAutoDismissTimeoutRef, latestBannerTokenRef]);

    return {
        currentValue,
        generatorSettings,
        handleBlur,
        handleChangeText,
        handleFocus,
        handleInputWrapperRef,
        inputRef,
        markBannerInteraction,
        onInputTouchStart: suppressNextPassphraseBannerDismiss,
        showGeneratorSettingsModal,
        adjustGeneratorLength,
        closeGeneratorSettings,
        updateGeneratorSettings,
    };
}
