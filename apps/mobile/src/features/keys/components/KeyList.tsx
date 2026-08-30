import React from 'react';
import { StyleSheet, TouchableOpacity, View, Keyboard, useWindowDimensions } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { theme } from '../../../styles/theme';
import { KeyPair } from '../../../types/types';
import { CustomText } from '../../../components/CustomText';
import { getDisplayName } from '../domain/displayNameUtils';

interface KeyListProps {
    keys: KeyPair[];
    selectedKeys: { [fingerprint: string]: string }[];
    onToggleKey: (key: KeyPair) => void;
    renderExtra?: (key: KeyPair) => React.ReactNode;
    onLongPressKey?: (key: KeyPair) => void;
    testIDPrefix?: string;
}

export const KeyList: React.FC<KeyListProps> = ({
    keys,
    selectedKeys,
    onToggleKey,
    renderExtra,
    onLongPressKey,
    testIDPrefix,
}) => {
    const isSelected = (fingerprint: string) => selectedKeys.some(k => fingerprint in k);
    const showsDetails = Boolean(renderExtra);
    const { width } = useWindowDimensions();
    const chipMaxWidth = Math.max(150, Math.min(width - theme.spacing.xl * 2, 320));

    return (
        <View style={styles.container}>
            {keys.map((key, index) => {
                const selected = isSelected(key.fingerprint);
                const displayName = getDisplayName(key.userId);

                return (
                    <View
                        key={key.fingerprint}
                        style={[
                            styles.keyItemWrapper,
                            !showsDetails && { maxWidth: chipMaxWidth },
                            showsDetails && styles.detailItemWrapper,
                        ]}
                    >
                        <TouchableOpacity
                            testID={testIDPrefix ? `${testIDPrefix}.item.${index}` : undefined}
                            style={[
                                showsDetails ? styles.detailItem : styles.keyItem,
                                !showsDetails && { maxWidth: chipMaxWidth },
                                showsDetails
                                    ? (selected ? styles.detailItemSelected : styles.detailItemIdle)
                                    : (selected ? styles.keyItemSelected : styles.keyItemIdle),
                            ]}
                            onPressIn={() => Keyboard.dismiss()}
                            onPress={() => {
                                setTimeout(() => onToggleKey(key), 50);
                            }}
                            onLongPress={() => onLongPressKey && onLongPressKey(key)}
                            activeOpacity={0.78}
                        >
                            {renderExtra ? renderExtra(key) : (
                                <View style={styles.keyLabelContainer}>
                                    <View style={[styles.keyDot, selected && styles.keyDotSelected]} />
                                    <CustomText style={styles.keyLabel}>
                                        {displayName || key.userId.trim() || 'Unnamed Key'}
                                    </CustomText>
                                    {key.isDefault && (
                                        <Icon
                                            name="star"
                                            size={15}
                                            color={selected ? theme.colors.secondary : theme.colors.primaryStrong}
                                            style={styles.defaultStar}
                                        />
                                    )}
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        alignItems: 'flex-start',
    },
    keyItemWrapper: {
        flexShrink: 1,
        flexGrow: 0,
        alignSelf: 'flex-start',
        maxWidth: '100%',
    },
    detailItemWrapper: {
        width: '100%',
        flexShrink: 0,
    },
    keyItem: {
        borderRadius: theme.borderRadius.pill,
        borderWidth: 1,
        paddingHorizontal: 13,
        paddingVertical: 9,
        minHeight: 40,
        maxWidth: '100%',
        justifyContent: 'center',
    },
    detailItem: {
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 14,
        width: '100%',
    },
    keyItemIdle: {
        backgroundColor: theme.colors.surfaceElevated,
        borderColor: theme.colors.dividerStrong,
    },
    keyItemSelected: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
        elevation: 3,
    },
    detailItemIdle: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.divider,
    },
    detailItemSelected: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
        ...theme.elevation.glow,
    },
    keyLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        justifyContent: 'center',
        gap: 7,
        minWidth: 0,
        maxWidth: '100%',
    },
    keyDot: {
        width: 7,
        height: 7,
        borderRadius: 999,
        backgroundColor: theme.colors.textMuted,
    },
    keyDotSelected: {
        backgroundColor: theme.colors.secondary,
    },
    keyLabel: {
        color: theme.colors.text,
        fontWeight: '700',
        fontSize: 13,
        lineHeight: 17,
        flexShrink: 1,
        textAlign: 'center',
    },
    defaultStar: {
        flexShrink: 0,
    },
});
