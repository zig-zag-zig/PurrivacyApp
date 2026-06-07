import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { theme } from '../../styles/theme';

type FormFieldProps = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

export const FormField = ({ children, style }: FormFieldProps) => (
    <View style={[styles.field, style]}>
        {children}
    </View>
);

const styles = StyleSheet.create({
    field: {
        marginBottom: theme.spacing.md,
    },
});
