import React from 'react';
import { StyleSheet } from 'react-native';

import { AutofillDisabledView } from '../../../components/AutofillDisabledView';
import { InputField } from '../../../components/InputField';
import { PASSPHRASE_MAX_LENGTH } from '../../../config/inputLimits';
import { theme } from '../../../styles/theme';
import {
    usePassphraseFieldController,
    type PassphraseBannerMode,
} from '../hooks/usePassphraseFieldController';
import { PassphraseGeneratorSettingsModal } from './PassphraseGeneratorSettingsModal';

export interface PassphraseFieldProps {
    fingerprint?: string;
    name?: string;
    onPassphraseChange?: (passphrase: string) => void;
    onGeneratedPassphrase?: (passphrase: string) => void;
    hidden?: boolean;
    doNotUseAutofill?: boolean;
    bannerMode?: PassphraseBannerMode;
    label?: string;
    error?: string;
    value?: string;
    helperText?: string;
    labelTopBackgroundColor?: string;
    labelBottomBackgroundColor?: string;
    testID?: string;
    storedPassphraseValue?: string | null;
}

export const PassphraseField: React.FC<PassphraseFieldProps> = ({
    fingerprint,
    onPassphraseChange,
    onGeneratedPassphrase,
    value,
    error,
    hidden,
    doNotUseAutofill,
    bannerMode,
    label,
    helperText,
    labelTopBackgroundColor,
    labelBottomBackgroundColor,
    testID,
    storedPassphraseValue,
}) => {
    const controller = usePassphraseFieldController({
        bannerMode,
        doNotUseAutofill,
        fingerprint,
        onGeneratedPassphrase,
        onPassphraseChange,
        testID,
        value,
        storedPassphraseValue,
    });

    if (hidden) return null;

    return (
        <AutofillDisabledView style={styles.container}>
            <InputField
                ref={controller.inputRef}
                value={controller.currentValue}
                onChangeText={controller.handleChangeText}
                onFocus={controller.handleFocus}
                onBlur={controller.handleBlur}
                secureTextEntry
                showToggleSecureText
                label={label}
                labelTopBackgroundColor={labelTopBackgroundColor}
                labelBottomBackgroundColor={labelBottomBackgroundColor}
                error={error}
                hidden={hidden}
                helperText={helperText}
                maxLength={PASSPHRASE_MAX_LENGTH}
                onInputWrapperRef={controller.handleInputWrapperRef}
                onInputTouchStart={controller.onInputTouchStart}
                testID={testID}
            />
            <PassphraseGeneratorSettingsModal
                visible={controller.showGeneratorSettingsModal}
                settings={controller.generatorSettings}
                onClose={controller.closeGeneratorSettings}
                onInteract={controller.markBannerInteraction}
                onAdjustLength={controller.adjustGeneratorLength}
                onSettingsChange={controller.updateGeneratorSettings}
            />
        </AutofillDisabledView>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: theme.spacing.sm,
    },
});
