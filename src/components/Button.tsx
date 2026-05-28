import React from 'react';
import {
    ActivityIndicator,
    Keyboard,
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { CustomText } from './CustomText';

type ButtonSize = 'default' | 'compact';

type ButtonProps = {
    label?: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary';
    loading?: boolean;
    icon?: React.ReactNode;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    iconOnly?: boolean;
    hidden?: boolean;
    size?: ButtonSize;
};

export const Button = ({
    label,
    onPress,
    variant = 'primary',
    loading = false,
    icon,
    disabled = false,
    style,
    iconOnly = false,
    hidden = false,
    size = 'default',
}: ButtonProps) => {
    if (hidden) return null;
    const isDisabled = disabled || loading;

    const getVariantStyle = () => {
        switch (variant) {
            case 'primary':
                return commonStyles.buttonPrimary;
            default:
                return commonStyles.buttonSecondary;
        }
    };

    const getTextColor = () => {
        if (variant === 'primary') return theme.colors.onPrimary;
        if (disabled && !loading) return theme.colors.textSecondary;
        return theme.colors.primary;
    };

    const textColor = getTextColor();

    const showLeadingSlot = Boolean(icon || loading) && !iconOnly;

    const buttonStyles = [
        commonStyles.button,
        getVariantStyle(),
        iconOnly && commonStyles.buttonIcon,
        size === 'compact' && styles.compactButton,
        isDisabled && commonStyles.disabled,
        style,
    ];

    const handlePress = () => {
        Keyboard.dismiss();
        onPress();
    };

    return (
        <TouchableOpacity
            style={buttonStyles}
            onPress={handlePress}
            disabled={isDisabled}
            activeOpacity={0.78}
        >
            {iconOnly ? (
                <View style={styles.iconContent}>
                    {loading ? (
                        <ActivityIndicator size="small" color={textColor} />
                    ) : icon}
                </View>
            ) : (
                <View style={[commonStyles.row, styles.buttonContent]}>
                    {showLeadingSlot && (
                        <View style={styles.leadingSlot}>
                            {loading ? (
                                <ActivityIndicator size="small" color={textColor} />
                            ) : icon}
                        </View>
                    )}
                    {label && (
                        <CustomText style={[commonStyles.textLabel, {
                            color: textColor,
                            fontSize: size === 'compact' ? theme.typography.label.fontSize : theme.typography.body.fontSize,
                            lineHeight: size === 'compact' ? 18 : undefined,
                            fontWeight: '600',
                        }]}>
                            {label}
                        </CustomText>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    buttonContent: {
        gap: theme.spacing.xs,
    },
    leadingSlot: {
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    compactButton: {
        minHeight: 36,
        paddingVertical: 6,
        paddingHorizontal: theme.spacing.md,
        marginVertical: 0,
    },
});
