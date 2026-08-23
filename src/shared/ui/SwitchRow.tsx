import React from 'react';
import { StyleProp, StyleSheet, Switch, View, ViewStyle } from 'react-native';

import { CustomText } from '../../components/CustomText';
import { commonStyles } from '../../styles/commonStyles';
import { theme } from '../../styles/theme';

type SwitchRowProps = {
    disabled?: boolean;
    label: string;
    onValueChange?: (value: boolean) => void;
    required?: boolean;
    style?: StyleProp<ViewStyle>;
    value: boolean;
};

export const SwitchRow = ({
    disabled = false,
    label,
    onValueChange,
    required = false,
    style,
    value,
}: SwitchRowProps) => (
    <View style={[styles.row, disabled && styles.rowDisabled, style]}>
        <Switch
            value={value}
            onValueChange={disabled ? undefined : onValueChange}
            disabled={disabled}
            trackColor={{ false: theme.colors.dividerStrong, true: theme.colors.primary }}
            thumbColor={value ? theme.colors.text : theme.colors.textMuted}
            style={styles.switch}
        />
        <CustomText style={[
            commonStyles.textBody,
            {
                color: disabled ? theme.colors.textSecondary : theme.colors.text,
            },
        ]}>
            {label}
            {required ? ' (required)' : ''}
        </CustomText>
    </View>
);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginBottom: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    rowDisabled: {
        opacity: 0.58,
    },
    switch: {
        marginRight: theme.spacing.sm,
    },
});
