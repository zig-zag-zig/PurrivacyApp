// Keep these polyfills before modules that may touch crypto or Buffer at import time.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;
import { DarkTheme, NavigationContainer, useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AuthProvider, useAuth } from './src/features/auth/state/AuthContext';
import { StackNavigator } from './src/app/navigation/StackNavigator';
import { resetSessionTimer } from './src/features/security/services/activityService';
import { theme } from './src/styles/theme';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from './src/app/state/ToastContext';
import { MfaProvider } from './src/features/mfa/state/MfaContext';
import { ModalProvider } from './src/app/state/ModalContext';
import { RootNavigationProps } from './src/app/navigation/types';
import { identifyKeyType } from './src/features/keys/domain/pgpValidation';
import { useToast } from './src/app/state/ToastContext';
import HiddenPGPWebView from './src/components/HiddenPGPWebView';
import { useWebViewPGP } from './src/hooks/useWebViewPGP';
import { commonStyles } from './src/styles/commonStyles';
import { UpdateProvider, useAppUpdate } from './src/features/updates/state/UpdateContext';
import { useShareIntent } from './src/features/share-intent/hooks/useShareIntent';
import { initErrorMonitoring, wrapWithErrorMonitoring } from './src/services/monitoring/sentry';
import { logger } from './src/utils/logger';
import { PassphraseBannerOverlayProvider } from './src/features/keys/components/PassphraseBannerOverlay';
import { GlobalSpinnerProvider, useGlobalSpinner } from './src/app/state/GlobalSpinnerContext';
import { usePassphraseStorageAutoSync } from './src/features/security/hooks/usePassphraseStorageAutoSync';
initErrorMonitoring();

const navigationTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        border: theme.colors.divider,
        notification: theme.colors.primary,
    },
};

const AppContent = () => {
    const { lock, authCompleted, user, isCheckingInactivity, userDecrypted } = useAuth();
    const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();
    const pendingShareRef = useRef<{ screen: "Key" | "Decrypt" | "Encrypt", text: string, timestamp: number } | null>(null);
    const { webViewRef, onReload, reloadWebView } = useWebViewPGP();
    const previousUserRef = useRef(user);
    const updateStartupCheckedRef = useRef(false);
    const appUpdate = useAppUpdate();
    const showStartupLoading = !authCompleted;
    useGlobalSpinner(showStartupLoading || (authCompleted && isCheckingInactivity));
    usePassphraseStorageAutoSync(userDecrypted);

    useEffect(() => {
        if (!authCompleted || updateStartupCheckedRef.current || !appUpdate.isConfigured) return;

        updateStartupCheckedRef.current = true;
        void appUpdate.checkForUpdates({
            silent: true,
            showModalOnUpdate: true,
            respectSkippedVersion: true,
        });
    }, [authCompleted, appUpdate]);

    useEffect(() => {
        if (!authCompleted) return;

        if (error) {
            console.error('Share Intent Error:', error);
            showToast('Failed to handle incoming share', 'error');
            resetShareIntent();
            return;
        }

        let text = shareIntent.text;
        const trimmedText = text?.trim();
        if (hasShareIntent && trimmedText) {
            const targetScreen = getTargetScreen(trimmedText);
            text = targetScreen === 'Encrypt' ? text! : trimmedText;

            if (!user) {
                pendingShareRef.current = {
                    screen: targetScreen,
                    text,
                    timestamp: Date.now(),
                };
                resetShareIntent();
                return;
            }

            navigation.navigate('Home', { screen: targetScreen, params: { text } });
            resetShareIntent();
        }
    }, [hasShareIntent, shareIntent, error, navigation, resetShareIntent, authCompleted, user]);

    useEffect(() => {
        if (user && pendingShareRef.current) {
            const { screen, text, timestamp } = pendingShareRef.current;
            if (Date.now() - timestamp < 3 * 60 * 1000) {
                navigation.navigate('Home', { screen, params: { text } });
            }
            pendingShareRef.current = null;
        }
    }, [user, navigation]);

    useEffect(() => {
        if (previousUserRef.current && !user) {
            reloadWebView();
        }
        previousUserRef.current = user;
    }, [user, reloadWebView]);

    const getTargetScreen = (text: string) => {
        const keyType = identifyKeyType(text);

        switch (keyType) {
            case 'private':
            case 'public':
                return 'Key';
            case 'message':
                return 'Decrypt';
            default:
                return 'Encrypt';
        }
    }

    return (
        <View style={commonStyles.flex}>
            <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} translucent={false} />
            {!showStartupLoading ? (
                <SafeAreaView
                    edges={['top', 'left', 'right']}
                    style={{ ...commonStyles.flex, backgroundColor: theme.colors.background }}
                    onTouchStart={() => user?.uid ? resetSessionTimer(user.uid, lock) : {}}
                >
                    <StackNavigator />
                </SafeAreaView>
            ) : null}
            {!showStartupLoading && user ? (
                <View pointerEvents="none" style={styles.hiddenWebViewHost}>
                    <HiddenPGPWebView ref={webViewRef} onReload={onReload} />
                </View>
            ) : null}
        </View>
    );
};

function App() {
    return (
        <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <ErrorBoundary>
                    <GlobalSpinnerProvider>
                        <ToastProvider>
                            <AuthProvider>
                                <MfaProvider>
                                    <ModalProvider>
                                        <UpdateProvider>
                                            <PassphraseBannerOverlayProvider>
                                                <NavigationContainer theme={navigationTheme}>
                                                    <AppContent />
                                                </NavigationContainer>
                                            </PassphraseBannerOverlayProvider>
                                        </UpdateProvider>
                                    </ModalProvider>
                                </MfaProvider>
                            </AuthProvider>
                        </ToastProvider>
                    </GlobalSpinnerProvider>
                </ErrorBoundary>
            </GestureHandlerRootView>
        </SafeAreaProvider>
    );
}

export default wrapWithErrorMonitoring(App);

const styles = StyleSheet.create({
    hiddenWebViewHost: {
        position: 'absolute',
        width: 1,
        height: 1,
        left: -1000,
        top: -1000,
        opacity: 0,
        overflow: 'hidden',
    },
});
