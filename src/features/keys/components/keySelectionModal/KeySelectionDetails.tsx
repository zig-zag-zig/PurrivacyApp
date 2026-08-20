import Icon from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CustomText } from '../../../../components/CustomText';
import { commonStyles } from '../../../../styles/commonStyles';
import { theme } from '../../../../styles/theme';
import type { KeyPair } from '../../../../types/types';
import { getDisplayName } from '../../domain/displayNameUtils';
import { KeyMetadataPills } from '../KeyMetadataPills';

type KeySelectionDetailsProps = {
    keyPair: KeyPair;
    selected: boolean;
};

/**
 * Dumb row-details component (APP-ARCH-002) — the expanded key detail block
 * rendered inside KeyList via renderExtra. Moved verbatim from the
 * renderKeyDetails closure in KeySelectionModal.tsx; no style/testID changes.
 */
export const KeySelectionDetails: React.FC<KeySelectionDetailsProps> = ({ keyPair, selected }) => (
    <View style={styles.detailsContainer}>
        <View style={styles.detailsHeader}>
            <CustomText style={styles.detailsTitle} numberOfLines={1}>
                {getDisplayName(keyPair.userId) || keyPair.userId.trim() || 'Unnamed Key'}
            </CustomText>
            <View style={styles.detailsAction}>
                {keyPair.isDefault ? (
                    <View style={commonStyles.iconButton} accessibilityLabel="Default key">
                        <Icon name="star" size={24} color={theme.colors.primary} />
                    </View>
                ) : null}
            </View>
        </View>
        <KeyMetadataPills
            keyPair={keyPair}
            selected={selected}
        />
    </View>
);

const styles = StyleSheet.create({
    detailsContainer: {
        gap: theme.spacing.sm,
        minWidth: 0,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
    },
    detailsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    detailsTitle: {
        ...commonStyles.textBody,
        flex: 1,
        minWidth: 0,
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 16,
    },
    detailsAction: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 40,
    },
});
