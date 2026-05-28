import React, { Component, ReactNode } from 'react';
import { Button, View, StyleSheet } from 'react-native';
import RNRestart from 'react-native-restart';
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

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    handleRestart = () => {
        RNRestart.Restart(); // This will restart the app
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
