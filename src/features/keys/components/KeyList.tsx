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
                            {renderExtra ? renderExtra(key)
                                : <View style={styles.keyLabelContainer}>
                                    <CustomText
                                        style={styles.keyLabel}
                                    >
                                        {displayName || key.userId.trim() || 'Unnamed Key'}
                                    </CustomText>
                                    {key.isDefault && (
                                        <Icon
                                            name="star"
                                            size={15}
                                            color={selected ? '#E9D7FF' : theme.colors.primary}
                                            style={styles.defaultStar}
                                        />
                                    )}
                                </View>}
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
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 7,
        minHeight: 34,
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
        backgroundColor: '#342F3D',
        borderColor: '#6B5D7A',
    },
    keyItemSelected: {
        backgroundColor: '#553874',
        borderColor: '#D2A8FF',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 2,
    },
    detailItemIdle: {
        backgroundColor: '#24212D',
        borderColor: '#6F6080',
    },
    detailItemSelected: {
        backgroundColor: '#5A3478',
        borderColor: '#D1A8FF',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: 4,
    },
    keyLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        justifyContent: 'center',
        gap: 5,
        minWidth: 0,
        maxWidth: '100%',
    },
    keyLabel: {
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 13,
        lineHeight: 17,
        flexShrink: 1,
        textAlign: 'center',
    },
    defaultStar: {
        flexShrink: 0,
    },
});
