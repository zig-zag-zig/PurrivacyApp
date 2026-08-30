import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { theme } from '../styles/theme';

interface SpinnerProps {
    visible: boolean;
    size?: 'large' | 'small';
}

export const Spinner: React.FC<SpinnerProps> = ({ visible, size = 'large' }) =>
    visible ? (
        <View style={styles.spinnerOverlay}>
            <ActivityIndicator size={size} color={theme.colors.primary} />
        </View>
    ) : null;

const styles = StyleSheet.create({
    spinnerOverlay: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
});
