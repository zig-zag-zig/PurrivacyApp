import Icon from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { InputField } from '../../../components/InputField';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { KeyMaterialBlock } from './KeyMaterialBlock';

export type PrivateKeyRevealLoading = 'account' | 'biometric' | null;

type PrivateKeyRevealPanelProps = {
    accountPassword: string;
    canRevealWithBiometrics: boolean;
    copied: boolean;
    error: string;
    isPrivateKeyProtected: boolean;
    loading: PrivateKeyRevealLoading;
    onAccountPasswordChange: (value: string) => void;
    onCopyPrivateKey: () => void;
    onHidePrivateKey: () => void;
    onRevealWithAccountPassword: () => void;
    onRevealWithBiometric: () => void;
    privateKey: string;
    privateKeyVisible: boolean;
};

const SURFACE_LABEL_BACKPLATE_PROPS = {
    labelTopBackgroundColor: theme.colors.surface,
    labelBottomBackgroundColor: theme.colors.surface,
} as const;

export const PrivateKeyRevealPanel = ({
    accountPassword,
    canRevealWithBiometrics,
    copied,
    error,
    isPrivateKeyProtected,
    loading,
    onAccountPasswordChange,
    onCopyPrivateKey,
    onHidePrivateKey,
    onRevealWithAccountPassword,
    onRevealWithBiometric,
    privateKey,
    privateKeyVisible,
}: PrivateKeyRevealPanelProps) => {
    const revealBusy = loading !== null;

    return (
        <View style={styles.privateKeySection}>
            <View style={styles.sectionHeader}>
                <CustomText style={styles.sectionTitle}>Private key</CustomText>
                {privateKeyVisible && (
                    <TouchableOpacity
                        onPress={onHidePrivateKey}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Hide private key"
                    >
                        <Icon name="visibility-off" size={22} color={theme.colors.primary} />
                    </TouchableOpacity>
                )}
            </View>

            {privateKeyVisible ? (
                <>
                    <KeyMaterialBlock
                        text={privateKey}
                        copied={copied}
                        onCopy={onCopyPrivateKey}
                    />

                    <Button
                        label="Copy private key"
                        onPress={onCopyPrivateKey}
                        variant="secondary"
                        size="compact"
                        style={styles.revealButton}
                    />
                </>
            ) : (
                <View style={styles.revealPanel}>
                    <InputField
                        {...SURFACE_LABEL_BACKPLATE_PROPS}
                        label="Account password"
                        value={accountPassword}
                        onChangeText={onAccountPasswordChange}
                        autoComplete="current-password"
                        enableAutofill
                        secureTextEntry
                        showToggleSecureText
                        textContentType="password"
                        error={undefined}
                    />

                    {error ? (
                        <CustomText style={styles.revealError}>
                            {error}
                        </CustomText>
                    ) : null}

                    <Button
                        label="Unlock with account password"
                        onPress={onRevealWithAccountPassword}
                        loading={loading === 'account'}
                        disabled={revealBusy || !accountPassword}
                        variant={isPrivateKeyProtected ? 'secondary' : 'primary'}
                        size="compact"
                        style={styles.revealButton}
                    />

                    {canRevealWithBiometrics && (
                        <Button
                            label="Unlock with biometrics"
                            onPress={onRevealWithBiometric}
                            loading={loading === 'biometric'}
                            disabled={revealBusy}
                            variant="secondary"
                            size="compact"
                            style={styles.revealButton}
                        />
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    privateKeySection: {
        gap: theme.spacing.md,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        ...commonStyles.textBody,
        color: theme.colors.text,
        fontWeight: '700',
    },
    revealPanel: {
        gap: theme.spacing.md,
    },
    revealButton: {
        marginVertical: 0,
        alignSelf: 'stretch',
    },
    revealError: {
        ...commonStyles.textCaption,
        color: theme.colors.error,
        marginLeft: theme.spacing.md,
    },
});
