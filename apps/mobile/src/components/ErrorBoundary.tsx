import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, View, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { CustomText } from './CustomText';
import { commonStyles } from '../styles/commonStyles';
import { captureAppError } from '../services/monitoring/sentry';
import { logger } from '../utils/logger';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };
    private reportedError = false;

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // One-shot report: include only the error and component stack, never props/state
        // (they may contain secrets such as passphrases or recovery seeds).
        if (this.reportedError) {
            return;
        }
        this.reportedError = true;
        captureAppError(error, {
            source: 'ErrorBoundary',
            componentStack: info.componentStack ?? null,
        });
        logger.error('Unhandled error caught by ErrorBoundary', {
            componentStack: info.componentStack ?? null,
        });
    }

    handleRestart = () => {
        void Updates.reloadAsync();
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={[commonStyles.flex, styles.center, { padding: 20 }]}>
                    <CustomText style={{ fontSize: 18, marginBottom: 20 }}>Something went wrong</CustomText>
                    <Button
                        title="Restart App"
                        onPress={this.handleRestart}
                    />
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});
