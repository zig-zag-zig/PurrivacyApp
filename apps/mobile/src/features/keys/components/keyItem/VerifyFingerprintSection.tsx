import React, { useState } from 'react';
import { Keyboard, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { StyleSheet } from 'react-native';

import { theme } from '../../../../styles/theme';
import { CustomText } from '../../../../components/CustomText';
import { InputField } from '../../../../components/InputField';
import { useToast } from '../../../../app/state/ToastContext';
import { useAuth } from '../../../auth/state/AuthContext';
import { useSecureCopy } from '../../../../shared/hooks/useSecureCopy';
import { EventService } from '../../../../services/eventService';
import { PgpKeyService } from '../../services/pgpKeyService';
import { getUserFacingErrorMessage } from '../../../../utils/errorHandling';
import type { KeyPair } from '../../../../types/types';

type VerifyFingerprintSectionProps = {
    pgpKey: KeyPair;
};

/** Group a fingerprint into readable 4-char blocks. */
const formatFingerprint = (fp: string): string =>
    fp.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ').toUpperCase();

const normalize = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

/**
 * Fingerprint verification utility. Shows the key's full fingerprint
 * (copyable), lets the user paste the fingerprint a contact claims over an
 * out-of-band channel, compares them, and records a `verified` flag on the
 * key record. It's a device-side attestation — it travels with the encrypted
 * record but is never sent anywhere else.
 */
export const VerifyFingerprintSection = ({ pgpKey }: VerifyFingerprintSectionProps) => {
    const { user } = useAuth();
    const { secureCopy } = useSecureCopy();
    const { showToast } = useToast();

    const [claim, setClaim] = useState('');
    const [busy, setBusy] = useState(false);

    const own = normalize(pgpKey.fingerprint);
    const claimed = normalize(claim);
    const compared = claimed.length > 0;
    const match = compared && claimed === own;

    const setVerified = async (verified: boolean) => {
        if (!user?.uid) return;
        setBusy(true);
        try {
            await PgpKeyService.setKeyVerified(user.uid, pgpKey.fingerprint, verified);
            EventService.addEvent('user');
            showToast(verified ? 'Marked as verified' : 'Verification removed', 'success');
        } catch (error) {
            showToast(getUserFacingErrorMessage(error, 'Could not update verified status'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const copyFingerprint = () => {
        Keyboard.dismiss();
        void secureCopy(formatFingerprint(pgpKey.fingerprint), { sensitivity: 'low' });
        showToast('Fingerprint copied', 'success');
    };

    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <CustomText style={styles.title}>Verify fingerprint</CustomText>
                <TouchableOpacity onPress={copyFingerprint} hitSlop={8} accessibilityLabel="Copy fingerprint" testID="purrivacy.key.verify.copyFingerprint">
                    <Icon name="content-copy" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
            </View>

            <CustomText style={styles.fingerprint} testID="purrivacy.key.verify.fingerprint">
                {formatFingerprint(pgpKey.fingerprint)}
            </CustomText>

            <CustomText style={styles.hint}>
                Compare this fingerprint with the contact's through a channel you both trust.
            </CustomText>

            <InputField
                label="Paste contact's fingerprint"
                value={claim}
                onChangeText={setClaim}
                autoCapitalize="none"
                autoCorrect={false}
                testID="purrivacy.key.verify.claim"
            />

            {compared && (
                <View style={[styles.result, match ? styles.resultMatch : styles.resultMismatch]}>
                    <Icon name={match ? 'check-circle' : 'cancel'} size={18} color={match ? theme.colors.success : theme.colors.error} />
                    <CustomText style={[styles.resultText, match ? { color: theme.colors.success } : { color: theme.colors.error }]}>
                        {match ? 'Fingerprints match' : 'Fingerprints do not match'}
                    </CustomText>
                </View>
            )}

            {pgpKey.verified ? (
                <View style={styles.verifiedRow}>
                    <View style={styles.verifiedBadge}>
                        <Icon name="verified-user" size={18} color={theme.colors.success} />
                        <CustomText style={styles.verifiedText}>Verified</CustomText>
                    </View>
                    <TouchableOpacity onPress={() => void setVerified(false)} disabled={busy} testID="purrivacy.key.verify.unmark">
                        <CustomText style={styles.unmark}>Remove</CustomText>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity
                    style={[styles.markButton, !match && styles.markButtonDisabled]}
                    onPress={() => void setVerified(true)}
                    disabled={busy || !match}
                    testID="purrivacy.key.verify.mark"
                >
                    <Icon name="verified-user" size={18} color={match ? theme.colors.onPrimary : theme.colors.textMuted} />
                    <CustomText style={[styles.markButtonText, !match && styles.markButtonTextDisabled]}>
                        Mark as verified
                    </CustomText>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    section: {
        gap: theme.spacing.sm,
        marginTop: theme.spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 15,
    },
    fingerprint: {
        color: theme.colors.primary,
        fontFamily: 'monospace',
        fontSize: 13,
        letterSpacing: 0.5,
    },
    hint: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
    },
    result: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
    },
    resultMatch: {},
    resultMismatch: {},
    resultText: {
        fontWeight: '600',
        fontSize: 13,
    },
    verifiedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
    },
    verifiedText: {
        color: theme.colors.success,
        fontWeight: '600',
    },
    unmark: {
        color: theme.colors.error,
        fontWeight: '600',
        fontSize: 13,
    },
    markButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.borderRadius.lg,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        alignSelf: 'flex-start',
    },
    markButtonDisabled: {
        backgroundColor: theme.colors.surfaceMuted,
    },
    markButtonText: {
        color: theme.colors.onPrimary,
        fontWeight: '600',
    },
    markButtonTextDisabled: {
        color: theme.colors.textMuted,
    },
});
