import { useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { InputField } from '../../../components/InputField';
import { theme } from '../../../styles/theme';
import { KeyPair } from '../../../types/types';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { ConfirmationDialog } from '../../settings/components/ConfirmationDialog';
import { useToast } from '../../../app/state/ToastContext';
import { getKeyTypeDescription, isCompletePair } from '../domain/keyUtils';
import { SUCCESS_MESSAGES } from '../../../utils/errorHandling';
import { PassphraseField } from './PassphraseField';
import { useAuth } from '../../auth/state/AuthContext';
import { securityService } from '../../security/services/securityService';
import { KeyMetadataPills } from './KeyMetadataPills';
import { EXPIRY_DAYS_MAX_LENGTH } from '../../../config/inputLimits';

type KeyItemProps = {
    pgpKey: KeyPair;
    onDelete?: () => void;
    onSetDefault?: () => void;
    onPress?: () => void;
    expanded?: boolean;
    readOnly?: boolean;
    onChangePassphrase?: (fingerprint: string, oldPass: string, newPass: string, newPassConfirm: string) => Promise<void>;
    onChangeExpiry?: (fingerprint: string, passphrase: string, newExpiryDays: string) => Promise<void>;
};

type PrivateKeyRevealLoading = 'account' | 'biometric' | null;

const SURFACE_LABEL_BACKPLATE_PROPS = {
    labelTopBackgroundColor: theme.colors.surface,
    labelBottomBackgroundColor: theme.colors.surface,
} as const;

export const KeyItem = ({ pgpKey, onDelete, onSetDefault, onPress, expanded, readOnly = false, onChangePassphrase, onChangeExpiry }: KeyItemProps) => {
    const [confirmVisible, setConfirmVisible] = useState(false);
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
    const [publicKeyCopied, setPublicKeyCopied] = useState(false);
    const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
    const publicKeyCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const privateKeyCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { showToast } = useToast();
    const {
        user,
        isBiometricAvailable,
        isBiometricEnabled,
        setLoginWithReauthenticateWithCredential,
    } = useAuth();

    useEffect(() => {
        if (!newPass) setNewPassConfirm('');
    }, [newPass])

    useEffect(() => () => {
        if (publicKeyCopyTimeoutRef.current) {
            clearTimeout(publicKeyCopyTimeoutRef.current);
        }
        if (privateKeyCopyTimeoutRef.current) {
            clearTimeout(privateKeyCopyTimeoutRef.current);
        }
    }, []);

    const canManageKey = !readOnly;
    const hasPrivateKey = Boolean(pgpKey.privateKey);
    const isPrivateKeyProtected = pgpKey.privateKeyIsUnlocked === false;
    const canRevealWithBiometrics = isBiometricAvailable && isBiometricEnabled && securityService.hasStandaloneBiometricAuth();
    const privateKeyRevealBusy = privateKeyRevealLoading !== null;
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
        setConfirmVisible(true);
    };

    const handleCopyPublicKey = () => {
        Keyboard.dismiss();
        Clipboard.setString(pgpKey.publicKey || '');
        setPublicKeyCopied(true);
        if (publicKeyCopyTimeoutRef.current) {
            clearTimeout(publicKeyCopyTimeoutRef.current);
        }
        publicKeyCopyTimeoutRef.current = setTimeout(() => {
            setPublicKeyCopied(false);
            publicKeyCopyTimeoutRef.current = null;
        }, 1600);
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
        Clipboard.setString(pgpKey.privateKey);
        setPrivateKeyCopied(true);
        if (privateKeyCopyTimeoutRef.current) {
            clearTimeout(privateKeyCopyTimeoutRef.current);
        }
        privateKeyCopyTimeoutRef.current = setTimeout(() => {
            setPrivateKeyCopied(false);
            privateKeyCopyTimeoutRef.current = null;
        }, 1600);
        showToast('Private key copied', 'success');
    };

    const setGeneratedNewPassphrase = (generatedPassphrase: string) => {
        setNewPass(generatedPassphrase);
        setNewPassConfirm(generatedPassphrase);
    };

    return (
        <View style={[styles.card, expanded && styles.cardExpanded]}>
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
                                <CustomText style={styles.tempLabel}>Temp</CustomText>
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
                    {hasPrivateKey && canManageKey && (
                        <View style={styles.privateKeySection}>
                            <View style={styles.sectionHeader}>
                                <CustomText style={styles.sectionTitle}>Private key</CustomText>
                                {privateKeyVisible && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            clearPrivateKeyReveal();
                                        }}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityLabel="Hide private key"
                                    >
                                        <Icon name="visibility-off" size={22} color={theme.colors.primary} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {privateKeyVisible ? (
                                <>
                                    <View style={[styles.keyBlock, privateKeyCopied && styles.keyBlockCopied]}>
                                        <ScrollView
                                            nestedScrollEnabled
                                            style={styles.keyBlockScroll}
                                            contentContainerStyle={styles.keyBlockScrollContent}
                                        >
                                            <TouchableOpacity
                                                onLongPress={handleCopyPrivateKey}
                                                delayLongPress={500}
                                                activeOpacity={0.7}
                                            >
                                                <CustomText
                                                    style={styles.keyBlockText}
                                                    selectable={false}
                                                    contextMenuHidden={true}
                                                >
                                                    {pgpKey.privateKey}
                                                </CustomText>
                                            </TouchableOpacity>
                                        </ScrollView>
                                    </View>

                                    <Button
                                        label="Copy private key"
                                        onPress={handleCopyPrivateKey}
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
                                        value={privateKeyAccountPassword}
                                        onChangeText={setPrivateKeyAccountPassword}
                                        autoComplete="current-password"
                                        enableAutofill
                                        secureTextEntry
                                        showToggleSecureText
                                        textContentType="password"
                                        error={undefined}
                                    />

                                    {privateKeyRevealError ? (
                                        <CustomText style={styles.revealError}>
                                            {privateKeyRevealError}
                                        </CustomText>
                                    ) : null}

                                    <Button
                                        label="Unlock with account password"
                                        onPress={handleRevealWithAccountPassword}
                                        loading={privateKeyRevealLoading === 'account'}
                                        disabled={privateKeyRevealBusy || !privateKeyAccountPassword}
                                        variant={isPrivateKeyProtected ? 'secondary' : 'primary'}
                                        size="compact"
                                        style={styles.revealButton}
                                    />

                                    {canRevealWithBiometrics && (
                                        <Button
                                            label="Unlock with biometrics"
                                            onPress={handleRevealWithBiometric}
                                            loading={privateKeyRevealLoading === 'biometric'}
                                            disabled={privateKeyRevealBusy}
                                            variant="secondary"
                                            size="compact"
                                            style={styles.revealButton}
                                        />
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {pgpKey.privateKey && canManageKey && (
                        <View style={styles.manageKeySection}>
                            <CustomText style={styles.sectionTitle}>Manage key</CustomText>

                            <View style={styles.formGroup}>
                                <CustomText style={styles.groupLabel}>Passphrase</CustomText>
                                <View style={styles.fieldStack}>
                                    <PassphraseField
                                        {...SURFACE_LABEL_BACKPLATE_PROPS}
                                        label="Current passphrase"
                                        fingerprint={pgpKey.fingerprint}
                                        onPassphraseChange={setOldPass}
                                        hidden={pgpKey.privateKeyIsUnlocked}
                                    />

                                    <PassphraseField
                                        {...SURFACE_LABEL_BACKPLATE_PROPS}
                                        label="New passphrase"
                                        fingerprint={pgpKey.fingerprint}
                                        onPassphraseChange={setNewPass}
                                        onGeneratedPassphrase={setGeneratedNewPassphrase}
                                        value={newPass}
                                        bannerMode="generate"
                                        helperText={pgpKey.privateKeyIsUnlocked ? undefined : 'Leave blank to remove the passphrase.'}
                                    />

                                    <PassphraseField
                                        {...SURFACE_LABEL_BACKPLATE_PROPS}
                                        label="Confirm new passphrase"
                                        fingerprint={pgpKey.fingerprint}
                                        onPassphraseChange={setNewPassConfirm}
                                        onGeneratedPassphrase={setGeneratedNewPassphrase}
                                        value={newPassConfirm}
                                        bannerMode="generate"
                                        hidden={!newPass}
                                    />
                                </View>
                                <View style={styles.actionRow}>
                                    <Button
                                        label="Change passphrase"
                                        onPress={async () => {
                                            if (!onChangePassphrase) return;
                                            setChangingPassword(true);
                                            try {
                                                await onChangePassphrase(pgpKey.fingerprint, oldPass, newPass, newPassConfirm);
                                                setOldPass(newPass);
                                                setNewPass('');
                                                setNewPassConfirm('');
                                            } catch (err: any) {
                                                showToast(err?.message || 'Failed to change passphrase', 'error');
                                            } finally {
                                                setChangingPassword(false);
                                            }
                                        }}
                                        disabled={newPass === oldPass}
                                        loading={changingPassword}
                                        size="compact"
                                        style={styles.actionButton}
                                    />
                                </View>
                            </View>

                            <View style={styles.formGroup}>
                                <CustomText style={styles.groupLabel}>Expiration</CustomText>
                                <InputField
                                    {...SURFACE_LABEL_BACKPLATE_PROPS}
                                    label="Expiry days"
                                    value={expiryDays}
                                    onChangeText={setExpiryDays}
                                    keyboardType="number-pad"
                                    numberOnly
                                    maxDigits={EXPIRY_DAYS_MAX_LENGTH}
                                    helperText="Leave blank, or enter below 1, for no expiry."
                                />
                                <View style={styles.actionRow}>
                                    <Button
                                        label="Change expiry"
                                        onPress={async () => {
                                            if (!onChangeExpiry) return;
                                            setChangingDate(true);
                                            try {
                                                await onChangeExpiry(pgpKey.fingerprint, oldPass, expiryDays);
                                                showToast('Expiry updated', 'success');
                                            } catch (err: any) {
                                                showToast(err?.message || 'Failed to change expiry', 'error');
                                            } finally {
                                                setChangingDate(false);
                                            }
                                        }}
                                        disabled={pgpKey.privateKeyIsUnlocked === false && !oldPass}
                                        loading={changingDate}
                                        size="compact"
                                        style={styles.actionButton}
                                    />
                                </View>
                            </View>
                        </View>
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
                        <View style={[styles.keyBlock, publicKeyCopied && styles.keyBlockCopied]}>
                            <ScrollView
                                nestedScrollEnabled
                                style={styles.keyBlockScroll}
                                contentContainerStyle={styles.keyBlockScrollContent}
                            >
                                <TouchableOpacity
                                    onLongPress={handleCopyPublicKey}
                                    delayLongPress={500}
                                    activeOpacity={0.7}
                                >
                                    <CustomText
                                        style={styles.keyBlockText}
                                        selectable={false}
                                        contextMenuHidden={true}
                                    >
                                        {pgpKey.publicKey || ''}
                                    </CustomText>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </View>
            )}
            <ConfirmationDialog
                visible={confirmVisible}
                title="Delete Key"
                message={`Are you sure you want to delete this ${getKeyTypeDescription(pgpKey).toLowerCase()}? This action cannot be undone.`}
                itemType="key"
                itemName={pgpKey.userId.trim()}
                onConfirm={() => {
                    setConfirmVisible(false);
                    onDelete?.();
                }}
                onCancel={() => setConfirmVisible(false)}
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
    privateKeySection: {
        gap: theme.spacing.md,
    },
    manageKeySection: {
        gap: theme.spacing.md,
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
    keyBlock: {
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        maxHeight: 260,
    },
    keyBlockCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
    keyBlockScroll: {
        maxHeight: 260,
    },
    keyBlockScrollContent: {
        padding: theme.spacing.md,
    },
    keyBlockText: {
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.text,
    },
    fieldStack: {
        gap: theme.spacing.sm,
    },
    formGroup: {
        gap: theme.spacing.sm,
    },
    groupLabel: {
        ...commonStyles.textCaption,
        color: theme.colors.textSecondary,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionButton: {
        flex: 1,
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
