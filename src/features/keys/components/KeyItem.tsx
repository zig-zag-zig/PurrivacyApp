import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { KeyPair } from '../../../types/types';
import { CustomText } from '../../../components/CustomText';
import { ConfirmationDialog } from '../../settings/components/ConfirmationDialog';
import { useToast } from '../../../app/state/ToastContext';
import { getKeyTypeDescription, isCompletePair } from '../domain/keyUtils';
import { SUCCESS_MESSAGES, getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { useAuth } from '../../auth/state/AuthContext';
import { securityService } from '../../security/services/securityService';
import { useCopyFeedback } from '../../../shared/hooks/useCopyFeedback';
import { KeyMetadataPills } from './KeyMetadataPills';
import { KeyManagementForm } from './KeyManagementForm';
import { KeyMaterialBlock } from './KeyMaterialBlock';
import { PrivateKeyRevealPanel } from './PrivateKeyRevealPanel';
import type { PrivateKeyRevealLoading } from './PrivateKeyRevealPanel';
import { useSecureCopy } from '../../../hooks/useSecureCopy';

type KeyItemProps = {
    pgpKey: KeyPair;
    onDelete?: () => void;
    deleting?: boolean;
    onSetDefault?: () => void;
    onPress?: () => void;
    expanded?: boolean;
    readOnly?: boolean;
    onChangePassphrase?: (fingerprint: string, oldPass: string, newPass: string, newPassConfirm: string) => Promise<void>;
    onChangeExpiry?: (fingerprint: string, passphrase: string, newExpiryDays: string) => Promise<void>;
};

export const KeyItem = ({ pgpKey, onDelete, onSetDefault, onPress, expanded, readOnly = false, onChangePassphrase, onChangeExpiry, deleting = false }: KeyItemProps) => {
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [deleteRequested, setDeleteRequested] = useState(false);
    const [oldPass, setOldPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [newPassConfirm, setNewPassConfirm] = useState('');
    const [expiryDays, setExpiryDays] = useState('365');
    const [changingPassword, setChangingPassword] = useState(false);
    const [changingDate, setChangingDate] = useState(false);
    const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
    const [privateKeyAccountPassword, setPrivateKeyAccountPassword] = useState('');
    const [privateKeyRevealError, setPrivateKeyRevealError] = useState('');
    const [privateKeyRevealLoading, setPrivateKeyRevealLoading] = useState<PrivateKeyRevealLoading>(null);
    const publicKeyCopyFeedback = useCopyFeedback();
    const privateKeyCopyFeedback = useCopyFeedback();
    const { showToast } = useToast();
    const {
        user,
        isBiometricAvailable,
        isBiometricEnabled,
        setLoginWithReauthenticateWithCredential,
    } = useAuth();
    const { secureCopy } = useSecureCopy();

    useEffect(() => {
        if (!newPass) setNewPassConfirm('');
    }, [newPass])

    const canManageKey = !readOnly;
    const hasPrivateKey = Boolean(pgpKey.privateKey);
    const isPrivateKeyProtected = pgpKey.privateKeyIsUnlocked === false;
    const canRevealWithBiometrics = isBiometricAvailable && isBiometricEnabled && securityService.hasStandaloneBiometricAuth();
    const keyTitle = pgpKey.userId.trim() || 'Unnamed key';

    const clearPrivateKeyReveal = () => {
        setPrivateKeyVisible(false);
        setPrivateKeyAccountPassword('');
        setPrivateKeyRevealError('');
        setPrivateKeyRevealLoading(null);
    };

    useEffect(() => {
        clearPrivateKeyReveal();
    }, [pgpKey.fingerprint]);

    useEffect(() => {
        if (!expanded) {
            clearPrivateKeyReveal();
        }
    }, [expanded]);

    const handleDelete = () => {
        if (!onDelete || readOnly) return;
        Keyboard.dismiss();
        setDeleteRequested(false);
        setConfirmVisible(true);
    };

    const handleCopyPublicKey = () => {
        Keyboard.dismiss();
        void secureCopy(pgpKey.publicKey || '');
        publicKeyCopyFeedback.markCopied();
        showToast(SUCCESS_MESSAGES.PUBLIC_KEY_COPIED, 'success');
    };

    const handlePrivateKeyRevealSuccess = () => {
        setPrivateKeyVisible(true);
        setPrivateKeyRevealError('');
        setPrivateKeyAccountPassword('');
    };

    const handleRevealWithAccountPassword = async () => {
        if (!pgpKey.privateKey) return;
        if (!privateKeyAccountPassword) {
            setPrivateKeyRevealError('Account password is required');
            return;
        }
        if (!user?.email) {
            setPrivateKeyRevealError('Sign in again before revealing private keys');
            return;
        }

        setPrivateKeyRevealError('');
        setPrivateKeyRevealLoading('account');
        setLoginWithReauthenticateWithCredential(true);

        try {
            const credential = EmailAuthProvider.credential(user.email, privateKeyAccountPassword);
            await reauthenticateWithCredential(user, credential);
            handlePrivateKeyRevealSuccess();
        } catch (error: any) {
            if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
                setPrivateKeyRevealError('Incorrect account password');
            } else {
                setPrivateKeyRevealError('Could not verify account password');
            }
        } finally {
            setLoginWithReauthenticateWithCredential(false);
            setPrivateKeyRevealLoading(null);
        }
    };

    const handleRevealWithBiometric = async () => {
        if (!pgpKey.privateKey || !canRevealWithBiometrics) return;

        setPrivateKeyRevealError('');
        setPrivateKeyRevealLoading('biometric');

        try {
            const authenticated = await securityService.authenticateBiometric('Unlock private key');
            if (authenticated) {
                handlePrivateKeyRevealSuccess();
            } else {
                setPrivateKeyRevealError('Biometric unlock is unavailable');
            }
        } catch (error: any) {
            if (!securityService.isBiometricAuthCancelled(error)) {
                setPrivateKeyRevealError('Biometric unlock failed');
            }
        } finally {
            setPrivateKeyRevealLoading(null);
        }
    };

    const handleCopyPrivateKey = () => {
        if (!privateKeyVisible || !pgpKey.privateKey) return;
        Keyboard.dismiss();
        void secureCopy(pgpKey.privateKey);
        privateKeyCopyFeedback.markCopied();
        showToast('Private key copied', 'success');
    };

    const handleChangePassphrasePress = async () => {
        if (!onChangePassphrase) return;
        setChangingPassword(true);
        try {
            await onChangePassphrase(pgpKey.fingerprint, oldPass, newPass, newPassConfirm);
            setOldPass(newPass);
            setNewPass('');
            setNewPassConfirm('');
        } catch (err: any) {
            showToast(getUserFacingErrorMessage(err, 'Failed to change passphrase'), 'error');
        } finally {
            setChangingPassword(false);
        }
    };

    const handleChangeExpiryPress = async () => {
        if (!onChangeExpiry) return;
        setChangingDate(true);
        try {
            await onChangeExpiry(pgpKey.fingerprint, oldPass, expiryDays);
            showToast('Expiry updated', 'success');
        } catch (err: any) {
            showToast(getUserFacingErrorMessage(err, 'Failed to change expiry'), 'error');
        } finally {
            setChangingDate(false);
        }
    };

    return (
        <View testID="purrivacy.key.item" style={[styles.card, expanded && styles.cardExpanded]}>
            <TouchableOpacity
                onPress={() => {
                    Keyboard.dismiss();
                    onPress?.();
                }}
                activeOpacity={0.72}
                style={[
                    styles.summaryPressable,
                    expanded && styles.summaryPressableExpanded,
                ]}
            >
                <View style={styles.summary}>
                    <View style={styles.summaryMain}>
                        <View style={styles.titleRow}>
                            <CustomText style={styles.keyTitle} numberOfLines={1}>
                                {keyTitle}
                            </CustomText>
                            {readOnly && (
                                <CustomText style={styles.tempLabel}>Temporary</CustomText>
                            )}
                        </View>

                        <KeyMetadataPills keyPair={pgpKey} />

                    </View>
                    <View style={styles.actionColumn}>
                        {isCompletePair(pgpKey) && onSetDefault && canManageKey ? (
                            pgpKey.isDefault ? (
                                <View style={commonStyles.iconButton} accessibilityLabel="Default key">
                                    <Icon name="star" size={24} color={theme.colors.primary} />
                                </View>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        onSetDefault();
                                    }}
                                    style={[commonStyles.iconButton]}
                                    accessibilityLabel="Set as default"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Icon name="star-border" size={24} color={theme.colors.primary} />
                                </TouchableOpacity>
                            )
                        ) : (
                            pgpKey.isDefault ? (
                                <View style={commonStyles.iconButton} accessibilityLabel="Default key">
                                    <Icon name="star" size={24} color={theme.colors.primary} />
                                </View>
                            ) : (
                                <View style={commonStyles.iconButton} />
                            )
                        )}

                        {canManageKey && onDelete ? (
                            <TouchableOpacity
                                onPress={handleDelete}
                                style={commonStyles.iconButton}
                                accessibilityLabel="Delete key"
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Icon name="delete" size={28} color={theme.colors.error} />
                            </TouchableOpacity>
                        ) : (
                            <View style={commonStyles.iconButton} />
                        )}
                    </View>
                </View>
            </TouchableOpacity>
            {expanded && (
                <View style={styles.details}>
                    {hasPrivateKey && canManageKey && pgpKey.privateKey ? (
                        <PrivateKeyRevealPanel
                            accountPassword={privateKeyAccountPassword}
                            canRevealWithBiometrics={canRevealWithBiometrics}
                            copied={privateKeyCopyFeedback.copied}
                            error={privateKeyRevealError}
                            isPrivateKeyProtected={isPrivateKeyProtected}
                            loading={privateKeyRevealLoading}
                            onAccountPasswordChange={setPrivateKeyAccountPassword}
                            onCopyPrivateKey={handleCopyPrivateKey}
                            onHidePrivateKey={() => {
                                Keyboard.dismiss();
                                clearPrivateKeyReveal();
                            }}
                            onRevealWithAccountPassword={handleRevealWithAccountPassword}
                            onRevealWithBiometric={handleRevealWithBiometric}
                            privateKey={pgpKey.privateKey}
                            privateKeyVisible={privateKeyVisible}
                        />
                    ) : null}

                    {pgpKey.privateKey && canManageKey && (
                        <KeyManagementForm
                            pgpKey={pgpKey}
                            oldPass={oldPass}
                            newPass={newPass}
                            newPassConfirm={newPassConfirm}
                            expiryDays={expiryDays}
                            changingPassword={changingPassword}
                            changingDate={changingDate}
                            onOldPassChange={setOldPass}
                            onNewPassChange={setNewPass}
                            onNewPassConfirmChange={setNewPassConfirm}
                            onExpiryDaysChange={setExpiryDays}
                            onChangePassphrase={handleChangePassphrasePress}
                            onChangeExpiry={handleChangeExpiryPress}
                            storedPassphraseValue={pgpKey.privateKeyPassphrase}
                        />
                    )}

                    <View style={styles.publicKeySection}>
                        <View style={styles.sectionHeader}>
                            <CustomText style={styles.sectionTitle}>Public key</CustomText>
                            <TouchableOpacity
                                onPress={handleCopyPublicKey}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel="Copy public key"
                            >
                                <Icon name="content-copy" size={20} color={theme.colors.primary} />
                            </TouchableOpacity>
                        </View>
                        <KeyMaterialBlock
                            text={pgpKey.publicKey || ''}
                            copied={publicKeyCopyFeedback.copied}
                            onCopy={handleCopyPublicKey}
                        />
                    </View>
                </View>
            )}
            <ConfirmationDialog
                visible={confirmVisible}
                title="Delete Key"
                message={`Are you sure you want to delete this ${getKeyTypeDescription(pgpKey).toLowerCase()}? This action cannot be undone.`}
                itemType="key"
                itemName={pgpKey.userId.trim()}
                loading={deleting}
                onConfirm={() => {
                    setDeleteRequested(true);
                    onDelete?.();
                }}
                onCancel={() => {
                    if (!deleting) {
                        setConfirmVisible(false);
                    }
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        ...theme.elevation.low
    },
    cardExpanded: {
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    summaryPressable: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
    },
    summaryPressableExpanded: {
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    summary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
    },
    summaryMain: {
        flex: 1,
        minWidth: 0,
        gap: theme.spacing.sm,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    keyTitle: {
        ...commonStyles.textBody,
        flex: 1,
        color: theme.colors.text,
        fontWeight: '700',
    },
    actionColumn: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
    },
    details: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        gap: theme.spacing.xl,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.lg,
    },
    publicKeySection: {
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
    tempLabel: {
        alignSelf: 'flex-start',
        color: theme.colors.primary,
        borderColor: theme.colors.primary,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
        marginTop: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 15,
    },
});
