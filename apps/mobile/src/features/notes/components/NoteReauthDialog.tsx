import React from 'react';
import { Keyboard, Modal, StyleSheet, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { InputField } from '../../../components/InputField';
import { ModalToastHost } from '../../../components/ModalToastHost';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import type { SecretReauthLoading } from '../../security/hooks/useSecretReauthorization';

type NoteReauthDialogProps = {
    accountPassword: string;
    canUseBiometrics: boolean;
    error: string;
    loading: SecretReauthLoading;
    noteTitle: string;
    onCancel: () => void;
    onChangeAccountPassword: (value: string) => void;
    onRevealWithAccountPassword: () => void;
    onRevealWithBiometric: () => void;
    visible: boolean;
};

const SURFACE_LABEL_BACKPLATE_PROPS = {
    // The field sits on the dialog's surface card, so the floating label's
    // notch has to match both halves of that card to stay invisible.
    labelTopBackgroundColor: theme.colors.surface,
    labelBottomBackgroundColor: theme.colors.surfaceElevated,
} as const;

/**
 * Opening gate for a protected note. Mirrors the private-key reveal policy:
 * the account password (Firebase re-authentication) or biometrics — the
 * unlocked vault alone does not open it.
 */
export const NoteReauthDialog = ({
    accountPassword,
    canUseBiometrics,
    error,
    loading,
    noteTitle,
    onCancel,
    onChangeAccountPassword,
    onRevealWithAccountPassword,
    onRevealWithBiometric,
    visible,
}: NoteReauthDialogProps) => {
    const busy = loading !== null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                Keyboard.dismiss();
                onCancel();
            }}
        >
            <View style={[commonStyles.modalOverlay, styles.centeringContainer]}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Icon name="lock" size={30} color={theme.colors.primaryStrong} />
                        <CustomText style={styles.title}>This note is protected</CustomText>
                        {!!noteTitle && (
                            <CustomText style={styles.noteName} numberOfLines={1}>
                                {noteTitle}
                            </CustomText>
                        )}
                        <CustomText style={styles.message}>
                            Verify it’s you to open and copy this note.
                        </CustomText>
                    </View>

                    <InputField
                        {...SURFACE_LABEL_BACKPLATE_PROPS}
                        label="Account password"
                        value={accountPassword}
                        onChangeText={onChangeAccountPassword}
                        autoComplete="current-password"
                        enableAutofill
                        secureTextEntry
                        showToggleSecureText
                        textContentType="password"
                        error={undefined}
                        testID="purrivacy.notes.reauth.password"
                    />

                    {error ? (
                        <CustomText style={styles.error}>{error}</CustomText>
                    ) : null}

                    <Button
                        label="Open note"
                        onPress={onRevealWithAccountPassword}
                        loading={loading === 'account'}
                        disabled={busy || !accountPassword}
                        testID="purrivacy.notes.reauth.password.submit"
                    />

                    {canUseBiometrics && (
                        <Button
                            label="Open with biometrics"
                            onPress={onRevealWithBiometric}
                            loading={loading === 'biometric'}
                            disabled={busy}
                            variant="secondary"
                            testID="purrivacy.notes.reauth.biometric"
                        />
                    )}

                    <Button
                        label="Cancel"
                        onPress={onCancel}
                        disabled={busy}
                        variant="secondary"
                        testID="purrivacy.notes.reauth.cancel"
                    />
                </View>
            </View>
            <ModalToastHost />
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeringContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.lg,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        ...theme.elevation.high,
        width: '100%',
        maxWidth: 420,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        alignSelf: 'center',
    },
    header: {
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
    },
    title: {
        ...commonStyles.textTitle,
        color: theme.colors.text,
        fontWeight: '600',
        textAlign: 'center',
    },
    noteName: {
        ...commonStyles.textCaption,
        color: theme.colors.primary,
        fontWeight: '600',
        maxWidth: '100%',
        textAlign: 'center',
    },
    message: {
        ...commonStyles.textBody,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
    },
    error: {
        ...commonStyles.textCaption,
        color: theme.colors.error,
    },
});