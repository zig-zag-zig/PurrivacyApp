import React from 'react';
import { Keyboard, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { commonStyles } from '../../../../styles/commonStyles';
import { theme } from '../../../../styles/theme';
import { CustomText } from '../../../../components/CustomText';
import type { KeyPair } from '../../../../types/types';
import { isCompletePair } from '../../domain/keyUtils';
import { KeyMetadataPills } from '../KeyMetadataPills';
import { styles } from './styles';

type KeyItemSummaryProps = {
    canDelete: boolean;
    canManageKey: boolean;
    expanded: boolean | undefined;
    keyTitle: string;
    pgpKey: KeyPair;
    readOnly: boolean;
    onDeletePress: () => void;
    onPress?: () => void;
    onSetDefault?: () => void;
};

/**
 * Key list-item presentation: summary row, metadata pills and the
 * default/delete action column (APP-ARCH-002). Pure extraction from
 * KeyItem.tsx; action handlers are owned by the caller.
 */
export const KeyItemSummary = ({
    canDelete,
    canManageKey,
    expanded,
    keyTitle,
    pgpKey,
    readOnly,
    onDeletePress,
    onPress,
    onSetDefault,
}: KeyItemSummaryProps) => (
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

                {canDelete ? (
                    <TouchableOpacity
                        onPress={onDeletePress}
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
);
