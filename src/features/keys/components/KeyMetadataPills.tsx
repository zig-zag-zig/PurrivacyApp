import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { CustomText } from '../../../components/CustomText';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import type { KeyPair } from '../../../types/types';
import { getKeyTypeDescription } from '../domain/keyUtils';

type KeyMetadataPill = {
    kind: 'metadata' | 'fingerprint';
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

    return fingerprint
        ? [...metadataPills, { kind: 'fingerprint' as const, value: fingerprint }]
        : metadataPills;
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
                        selected && styles.selectedMetadataChip,
                        selected && pill.kind === 'fingerprint' && styles.selectedFingerprintChip,
                    ]}
                >
                    <CustomText
                        style={[
                            styles.metadataText,
                            pill.kind === 'fingerprint' && styles.fingerprintText,
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
        borderColor: '#766786',
        backgroundColor: '#211E28',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 3,
    },
    fingerprintChip: {
        borderColor: '#8C63B0',
        backgroundColor: '#2E2440',
    },
    selectedMetadataChip: {
        borderColor: '#D7BEFF',
        backgroundColor: '#3A2452',
    },
    selectedFingerprintChip: {
        borderColor: '#F0E5FF',
        backgroundColor: '#4D2F6C',
    },
    metadataText: {
        ...commonStyles.textCaption,
        color: '#DED5E8',
        fontWeight: '700',
        lineHeight: 16,
    },
    fingerprintText: {
        color: theme.colors.text,
        fontFamily: 'monospace',
    },
    selectedMetadataText: {
        color: '#FFFFFF',
    },
});
