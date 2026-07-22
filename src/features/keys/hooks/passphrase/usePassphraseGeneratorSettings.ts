import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import { logger } from '../../../../utils/logger';
import { securityService } from '../../../security/services/securityService';
import {
    DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    normalizePassphraseGeneratorSettings,
} from '../../../security/services/passphraseGeneratorSettings';
import type { PassphraseGeneratorSettings } from '../../../security/services/passphraseGeneratorSettings';
import type { PassphraseBannerMode } from '../usePassphraseFieldController';

type UsePassphraseGeneratorSettingsParams = {
    bannerMode: PassphraseBannerMode;
    onGeneratedPassphrase?: (passphrase: string) => void;
    commitPassphraseRef: MutableRefObject<(text: string) => void>;
    onGeneratedPassphraseRef: MutableRefObject<((passphrase: string) => void) | undefined>;
    generatorSettingsRef: MutableRefObject<PassphraseGeneratorSettings>;
};

type UsePassphraseGeneratorSettingsResult = {
    generatorSettings: PassphraseGeneratorSettings;
    setGeneratorSettings: React.Dispatch<React.SetStateAction<PassphraseGeneratorSettings>>;
    generatedPassphrase: string;
    showGeneratorSettingsModal: boolean;
    setShowGeneratorSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;
    generatorSettingsOpeningRef: MutableRefObject<boolean>;
    settingsOpenTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    regeneratePassphrase: (settings?: PassphraseGeneratorSettings, applyToField?: boolean) => Promise<void>;
    loadGeneratorSettings: () => Promise<void>;
    updateGeneratorSettings: (settings: PassphraseGeneratorSettings) => Promise<void>;
    adjustGeneratorLength: (delta: number) => void;
};

/**
 * Extracted from usePassphraseFieldController — manages generator-settings state
 * and passphrase generation.  Open/close modal logic that touches banner state
 * lives in the façade (usePassphraseFieldController) to avoid cross-hook coupling.
 */
export function usePassphraseGeneratorSettings({
    bannerMode,
    onGeneratedPassphrase,
    commitPassphraseRef,
    onGeneratedPassphraseRef,
    generatorSettingsRef,
}: UsePassphraseGeneratorSettingsParams): UsePassphraseGeneratorSettingsResult {
    const [generatorSettings, setGeneratorSettings] = useState<PassphraseGeneratorSettings>(
        DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    );
    const [generatedPassphrase, setGeneratedPassphrase] = useState('');
    const [showGeneratorSettingsModal, setShowGeneratorSettingsModal] = useState(false);
    const generatorSettingsOpeningRef = useRef(false);
    const settingsOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const regeneratePassphrase = useCallback(async (
        settings: PassphraseGeneratorSettings = generatorSettingsRef.current,
        applyToField = false,
    ) => {
        try {
            const generated = await securityService.generatePassphrase(settings);
            setGeneratedPassphrase(generated);

            if (applyToField) {
                onGeneratedPassphraseRef.current?.(generated);
                if (!onGeneratedPassphraseRef.current) {
                    commitPassphraseRef.current(generated);
                }
            }
        } catch (generationError) {
            logger.warn('passphrase generation failed', { error: generationError });
        }
    }, [commitPassphraseRef, onGeneratedPassphraseRef, generatorSettingsRef]);

    const loadGeneratorSettings = useCallback(async () => {
        if (bannerMode !== 'generate') return;

        try {
            const settings = await securityService.getPassphraseGeneratorSettings();
            setGeneratorSettings(settings);
            await regeneratePassphrase(settings);
        } catch (settingsError) {
            logger.warn('passphrase generator settings load failed', { error: settingsError });
        }
    }, [bannerMode, regeneratePassphrase]);

    useFocusEffect(
        useCallback(() => {
            if (bannerMode !== 'generate') return undefined;
            void loadGeneratorSettings();
            return undefined;
        }, [bannerMode, loadGeneratorSettings]),
    );

    useEffect(() => {
        if (bannerMode === 'generate') {
            void loadGeneratorSettings();
        }
    }, [bannerMode, loadGeneratorSettings]);

    const updateGeneratorSettings = async (nextSettings: PassphraseGeneratorSettings) => {
        const normalized = normalizePassphraseGeneratorSettings(nextSettings);
        setGeneratorSettings(normalized);
        try {
            const saved = await securityService.setPassphraseGeneratorSettings(normalized);
            setGeneratorSettings(saved);
            await regeneratePassphrase(saved, true);
        } catch (settingsError) {
            logger.warn('passphrase generator settings save failed', { error: settingsError });
        }
    };

    const adjustGeneratorLength = (delta: number) => {
        void updateGeneratorSettings({
            ...generatorSettings,
            length: generatorSettings.length + delta,
        });
    };

    return {
        generatorSettings,
        setGeneratorSettings,
        generatedPassphrase,
        showGeneratorSettingsModal,
        setShowGeneratorSettingsModal,
        generatorSettingsOpeningRef,
        settingsOpenTimeoutRef,
        regeneratePassphrase,
        loadGeneratorSettings,
        updateGeneratorSettings,
        adjustGeneratorLength,
    };
}
