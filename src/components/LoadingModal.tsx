import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Spinner } from './Spinner';
import { theme } from '../styles/theme';

interface LoadingModalProps {
    visible: boolean;
}

export const LoadingModal: React.FC<LoadingModalProps> = ({ visible }) => {
    if (!visible) return null;

    return (
        <View style={styles.overlay}>
            <View style={styles.content}>
                <Spinner visible={true} size="large" />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFill,
        zIndex: 5000,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.lg,
    },
});
