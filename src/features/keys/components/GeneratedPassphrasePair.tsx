import React, { useCallback } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { theme } from '../../../styles/theme';
import { PassphraseField } from './PassphraseField';
import type { PassphraseFieldProps } from './PassphraseField';

type LabelBackplateProps = Pick<
    PassphraseFieldProps,
    'labelTopBackgroundColor' | 'labelBottomBackgroundColor'
>;

interface GeneratedPassphrasePairProps extends LabelBackplateProps {
    passphrase: string;
    confirmPassphrase: string;
    onPassphraseChange: (passphrase: string) => void;
    onConfirmPassphraseChange: (passphrase: string) => void;
    passphraseLabel: string;
    confirmPassphraseLabel: string;
    confirmTestID?: string;
    fingerprint?: string;
    helperText?: string;
    passphraseError?: string;
    confirmPassphraseError?: string;
    gap?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
}

export const GeneratedPassphrasePair = ({
    passphrase,
    confirmPassphrase,
    onPassphraseChange,
    onConfirmPassphraseChange,
    passphraseLabel,
    confirmPassphraseLabel,
    confirmTestID,
    fingerprint,
    helperText,
    passphraseError,
    confirmPassphraseError,
    gap = theme.spacing.sm,
    labelTopBackgroundColor,
    labelBottomBackgroundColor,
    style,
    testID,
}: GeneratedPassphrasePairProps) => {
    const handleGeneratedPassphrase = useCallback((generatedPassphrase: string) => {
        onPassphraseChange(generatedPassphrase);
        onConfirmPassphraseChange(generatedPassphrase);
    }, [onConfirmPassphraseChange, onPassphraseChange]);

    const sharedProps = {
        bannerMode: 'generate' as const,
        fingerprint,
        labelBottomBackgroundColor,
        labelTopBackgroundColor,
        onGeneratedPassphrase: handleGeneratedPassphrase,
    };

    return (
        <View style={[{ gap }, style]}>
            <PassphraseField
                {...sharedProps}
                label={passphraseLabel}
                value={passphrase}
                onPassphraseChange={onPassphraseChange}
                helperText={helperText}
                error={passphraseError}
                testID={testID}
            />
            <PassphraseField
                {...sharedProps}
                label={confirmPassphraseLabel}
                value={confirmPassphrase}
                onPassphraseChange={onConfirmPassphraseChange}
                error={confirmPassphraseError}
                testID={confirmTestID}
            />
        </View>
    );
};
