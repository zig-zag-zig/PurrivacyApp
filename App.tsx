// Keep these polyfills before modules that may touch crypto or Buffer at import time.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Configure API runtime ports before any module accesses them
import { configureAppApiRuntime } from './src/app/configureApiRuntime';
configureAppApiRuntime();
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
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
import HiddenPGPWebView from './src/components/HiddenPGPWebView';
import { useWebViewPGP } from './src/shared/hooks/useWebViewPGP';
import { commonStyles } from './src/styles/commonStyles';
import { UpdateProvider } from './src/features/updates/state/UpdateContext';
import { initErrorMonitoring, wrapWithErrorMonitoring } from './src/services/monitoring/sentry';
import { PassphraseBannerOverlayProvider } from './src/features/keys/components/PassphraseBannerOverlay';
import { GlobalSpinnerProvider, useGlobalSpinner } from './src/app/state/GlobalSpinnerContext';
import { usePassphraseStorageAutoSync } from './src/features/security/hooks/usePassphraseStorageAutoSync';
import { useStartupUpdateCheck } from './src/app/hooks/useStartupUpdateCheck';
import { useShareIntentRouting } from './src/app/hooks/useShareIntentRouting';
import { usePgpRuntimeOnUserChange } from './src/app/hooks/usePgpRuntimeOnUserChange';
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
    const { webViewRef, onReload, reloadWebView } = useWebViewPGP();
    const showStartupLoading = !authCompleted;
    useGlobalSpinner(showStartupLoading || (authCompleted && isCheckingInactivity));
    usePassphraseStorageAutoSync(userDecrypted);
    useStartupUpdateCheck(authCompleted);
    useShareIntentRouting();
    usePgpRuntimeOnUserChange(user, reloadWebView);

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
