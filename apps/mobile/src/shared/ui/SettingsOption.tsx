import React from 'react';
import type { ComponentProps } from 'react';
import { ActivityIndicator, TouchableOpacity, View, Switch, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { theme } from '../../styles/theme';
import { CustomText } from '../../components/CustomText';

type MaterialIconName = ComponentProps<typeof Icon>['name'];

interface SettingsOptionProps {
    iconName?: MaterialIconName;
    text: string;
    onPress?: () => void;
    switchProps?: {
        value: boolean;
        onValueChange: (value: boolean) => void;
    };
    extraText?: string;
    transparentSwitch?: boolean;
    loading?: boolean;
    disabled?: boolean;
    testID?: string;
}

export const SettingsOption: React.FC<SettingsOptionProps> = ({
    iconName,
    text,
    onPress,
    switchProps,
    extraText,
    transparentSwitch,
    loading = false,
    disabled = false,
    testID,
}) => {
    const isSwitch = !!switchProps;
    const isDisabled = disabled || loading;

    const handlePress = () => {
        if (isDisabled) return;
        if (isSwitch) {
            switchProps!.onValueChange(!switchProps!.value);
        } else if (onPress) {
            onPress();
        }
    };

    return (
        <TouchableOpacity
            testID={testID}
            style={[
                styles.container,
                transparentSwitch && styles.transparentContainer,
                isDisabled && styles.disabledContainer,
            ]}
            onPress={handlePress}
            activeOpacity={(isSwitch || onPress) && !isDisabled ? 0.72 : 1}
            disabled={isDisabled}
        >
            <View style={styles.mainRow}>
                {iconName ? (
                    <View style={[styles.iconFrame, isDisabled && styles.iconFrameDisabled]}>
                        <Icon
                            name={iconName}
                            size={21}
                            color={isDisabled ? theme.colors.textMuted : theme.colors.primaryStrong}
                        />
                    </View>
                ) : null}
                <View style={styles.copy}>
                    <CustomText style={[styles.title, isDisabled && styles.titleDisabled]}>
                        {text}
                    </CustomText>
                    {extraText ? (
                        <CustomText style={styles.description}>{extraText}</CustomText>
                    ) : null}
                </View>
                {switchProps ? (
                    <View style={styles.accessorySlot}>
                        <Switch
                            value={switchProps.value}
                            onValueChange={switchProps.onValueChange}
                            disabled={isDisabled}
                            trackColor={{ false: theme.colors.dividerStrong, true: theme.colors.primary }}
                            thumbColor={switchProps.value ? theme.colors.text : theme.colors.textMuted}
                            style={loading && styles.loadingContent}
                        />
                        {loading ? (
                            <View pointerEvents="none" style={styles.loadingOverlay}>
                                <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                            </View>
                        ) : null}
                    </View>
                ) : onPress ? (
                    <View style={styles.chevronFrame}>
                        {loading ? (
                            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                        ) : (
                            <Icon name="chevron-right" size={22} color={theme.colors.textMuted} />
                        )}
                    </View>
                ) : loading ? (
                    <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                ) : null}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.md,
        minHeight: 76,
        ...theme.elevation.low,
    },
    transparentContainer: {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.divider,
        paddingVertical: 12,
        minHeight: 66,
        shadowOpacity: 0,
        elevation: 0,
    },
    disabledContainer: {
        opacity: 0.56,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
    },
    iconFrame: {
        width: 42,
        height: 42,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primaryMuted,
        borderWidth: 1,
        borderColor: `${theme.colors.primary}44`,
    },
    iconFrameDisabled: {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.divider,
    },
    copy: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: theme.colors.text,
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '700',
    },
    titleDisabled: {
        color: theme.colors.textMuted,
    },
    description: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        marginTop: theme.spacing.xs,
    },
    accessorySlot: {
        minWidth: 52,
        minHeight: 34,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    chevronFrame: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingContent: {
        opacity: 0,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
