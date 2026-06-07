import React from 'react';
import type { ComponentProps } from 'react';
import { ActivityIndicator, TouchableOpacity, View, Switch, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { CustomText } from '../../../components/CustomText';

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
            style={[commonStyles.surface, styles.container, transparentSwitch &&
            {
                backgroundColor: 'transparent',
                shadowColor: 'transparent',
                elevation: 0,
                borderWidth: 0,
                paddingHorizontal: 0,
                paddingVertical: 0,
                marginBottom: theme.spacing.xs,
            }]}
            onPress={handlePress}
            activeOpacity={(isSwitch || onPress) && !isDisabled ? 0.7 : 1}
            disabled={isDisabled}
        >
            <View style={[commonStyles.row, commonStyles.spaceBetween]}>
                <View style={[commonStyles.row, { gap: theme.spacing.sm }]}>
                    {iconName && (
                        <Icon
                            name={iconName}
                            size={24}
                            color={isDisabled ? theme.colors.textSecondary : theme.colors.primary}
                        />)}
                    <CustomText style={[
                        commonStyles.textLabel,
                        isDisabled && { color: theme.colors.textSecondary },
                    ]}>
                        {text}
                    </CustomText>
                </View>
                {switchProps && (
                    <View style={styles.accessorySlot}>
                        <Switch
                            value={switchProps.value}
                            onValueChange={switchProps.onValueChange}
                            disabled={disabled}
                            trackColor={{ false: theme.colors.divider, true: theme.colors.primary }}
                            thumbColor={switchProps.value ? theme.colors.onPrimary : theme.colors.surface}
                            style={loading && styles.loadingContent}
                        />
                        {loading && (
                            <View pointerEvents="none" style={styles.loadingOverlay}>
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                            </View>
                        )}
                    </View>
                )}
            </View>
            {loading && !switchProps && (
                <View pointerEvents="none" style={styles.optionLoadingOverlay}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
            )}
            {extraText && (
                <CustomText style={[commonStyles.textCaption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
                    {extraText}
                </CustomText>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.sm,
        position: 'relative',
    },
    accessorySlot: {
        minWidth: 52,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    loadingContent: {
        opacity: 0,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    optionLoadingOverlay: {
        position: 'absolute',
        top: 0,
        right: theme.spacing.md,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
});
