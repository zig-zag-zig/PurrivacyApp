import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { CustomText } from '../../../components/CustomText';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import type { KeyPair } from '../../../types/types';
import { EXPIRING_SOON_DAYS, parseKeyExpiry } from '../domain/keyExpiry';
import { getKeyTypeDescription } from '../domain/keyUtils';

type KeyMetadataPill = {
    kind: 'metadata' | 'fingerprint' | 'revoked' | 'expiring' | 'expired';
    value: string;
};

type KeyMetadataPillsProps = {
    keyPair: KeyPair;
    selected?: boolean;
    style?: StyleProp<ViewStyle>;
};

const formatFingerprint = (fingerprint: string): string => {
    const trimmed = fingerprint.trim();
    if (!trimmed) return '';

    const compact = trimmed.replace(/\s+/g, '');
    if (compact.length > 28) {
        return `${compact.slice(0, 12)}...${compact.slice(-12)}`;
    }

    return compact || trimmed;
};

const buildMetadataPills = (keyPair: KeyPair): KeyMetadataPill[] => {
    const algorithm = keyPair.algorithm.trim();
    const curve = keyPair.curve?.trim() || '';
    const keySize = algorithm.toLowerCase().includes('rsa') && keyPair.bitStrength
        ? `${keyPair.bitStrength} bit`
        : '';
    const technicalLabel = [algorithm, curve || keySize].filter(Boolean).join(' ');
    const fingerprint = formatFingerprint(keyPair.fingerprint);

    const metadataPills: KeyMetadataPill[] = [
        getKeyTypeDescription(keyPair),
        technicalLabel,
        keyPair.expiry.trim(),
    ]
        .filter((value): value is string => value.length > 0)
        .map(value => ({ kind: 'metadata' as const, value }));

    // Surface expiry state as a leading status pill. A revoked key already
    // leads with 'Revoked'; expiry is appended after it.
    const expiryStatus = parseKeyExpiry(keyPair.expiry);
    const statusPills: KeyMetadataPill[] = [];
    if (keyPair.revoked) {
        statusPills.push({ kind: 'revoked', value: 'Revoked' });
    }
    if (expiryStatus.kind === 'expired') {
        statusPills.push({ kind: 'expired', value: `Expired ${expiryStatus.daysAgo}d ago` });
    } else if (expiryStatus.kind === 'expiring' && expiryStatus.daysLeft <= EXPIRING_SOON_DAYS) {
        statusPills.push({ kind: 'expiring', value: `Expires in ${expiryStatus.daysLeft}d` });
    }

    const basePills: KeyMetadataPill[] = fingerprint
        ? [...statusPills, ...metadataPills, { kind: 'fingerprint' as const, value: fingerprint }]
        : [...statusPills, ...metadataPills];

    return basePills;
};

export const KeyMetadataPills = ({ keyPair, selected = false, style }: KeyMetadataPillsProps) => {
    const pills = buildMetadataPills(keyPair);
    if (pills.length === 0) return null;

    return (
        <View style={[styles.metadataRow, style]}>
            {pills.map((pill, index) => (
                <View
                    key={`${pill.kind}-${pill.value}-${index}`}
                    style={[
                        styles.metadataChip,
                        pill.kind === 'fingerprint' && styles.fingerprintChip,
                        pill.kind === 'revoked' && styles.revokedChip,
                        pill.kind === 'expiring' && styles.expiringChip,
                        pill.kind === 'expired' && styles.revokedChip,
                        selected && styles.selectedMetadataChip,
                        selected && pill.kind === 'fingerprint' && styles.selectedFingerprintChip,
                    ]}
                >
                    <CustomText
                        style={[
                            styles.metadataText,
                            pill.kind === 'fingerprint' && styles.fingerprintText,
                            pill.kind === 'revoked' && styles.revokedText,
                            pill.kind === 'expiring' && styles.expiringText,
                            pill.kind === 'expired' && styles.revokedText,
                            selected && styles.selectedMetadataText,
                        ]}
                    >
                        {pill.value}
                    </CustomText>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    metadataRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
    },
    metadataChip: {
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minWidth: 0,
        flexShrink: 1,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.dividerStrong,
        backgroundColor: theme.colors.surfaceMuted,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 3,
    },
    fingerprintChip: {
        borderColor: `${theme.colors.primary}88`,
        backgroundColor: theme.colors.primaryMuted,
    },
    revokedChip: {
        borderColor: theme.colors.error,
        backgroundColor: theme.colors.errorMuted,
    },
    revokedText: {
        color: theme.colors.error,
    },
    expiringChip: {
        borderColor: theme.colors.warning,
        backgroundColor: `${theme.colors.warning}1A`,
    },
    expiringText: {
        color: theme.colors.warning,
    },
    selectedMetadataChip: {
        borderColor: theme.colors.primaryStrong,
        backgroundColor: theme.colors.primaryMuted,
    },
    selectedFingerprintChip: {
        borderColor: theme.colors.secondary,
        backgroundColor: theme.colors.secondaryMuted,
    },
    metadataText: {
        ...commonStyles.textCaption,
        color: theme.colors.textSecondary,
        fontWeight: '700',
        lineHeight: 16,
    },
    fingerprintText: {
        color: theme.colors.text,
        fontFamily: 'monospace',
    },
    selectedMetadataText: {
        color: theme.colors.text,
    },
});
