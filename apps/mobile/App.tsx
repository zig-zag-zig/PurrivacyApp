// Keep these polyfills before modules that may touch crypto or Buffer at import time.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Configure API runtime ports before any module accesses them
import { configureAppApiRuntime } from './src/app/configureApiRuntime';
configureAppApiRuntime();
import { useCallback, useEffect } from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AuthProvider, useAuth } from './src/features/auth/state/AuthContext';
import { StackNavigator } from './src/app/navigation/StackNavigator';
import { resetSessionTimer } from './src/features/security/services/activityService';
import { pendingSignupSession } from './src/features/auth/services/pendingSignupSession';
import { useScreenCaptureProtection } from './src/features/security/hooks/useScreenCaptureProtection';
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
import { OperationCenterProvider, useOperationCenter } from './src/app/state/OperationCenterContext';
import { OperationCenterUI } from './src/app/components/OperationCenterUI';
import { purgeFileCryptoCaches } from './src/services/fileCacheCleanup';
import { clearLastEncryptedFile } from './src/services/fileCryptoService';
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
        card: theme.colors.backgroundElevated,
        text: theme.colors.text,
        border: theme.colors.divider,
        notification: theme.colors.primary,
    },
};

const AppContent = () => {
    const { lock, authCompleted, user, isCheckingInactivity, userDecrypted, appStateIsBackground, isLocalSessionLocked } = useAuth();
    const { failRunningOperations, clearFinished, resumeOperations } = useOperationCenter();
    const clearSensitiveOperationState = useCallback(() => {
        failRunningOperations('Interrupted because the vault locked or signed out');
        // Finished records can contain decrypted text, file names, and cache
        // URIs. Never carry them across a lock, sign-out, or account switch.
        clearFinished();
        purgeFileCryptoCaches();
        clearLastEncryptedFile();
    }, [failRunningOperations, clearFinished]);

    const handlePgpRuntimeCleared = clearSensitiveOperationState;
    const { webViewRef, onReload, reloadWebView } = useWebViewPGP();
    const showStartupLoading = !authCompleted;

    // Suspend and wipe only across a real security boundary: no user (signed
    // out) or a locally-locked session. `userDecrypted` must NOT be part of this
    // test — during signup a user exists with no decrypted records yet, and
    // treating that as locked aborted the signup key generation.
    useEffect(() => {
        if (!user || isLocalSessionLocked) {
            clearSensitiveOperationState();
            return;
        }
        resumeOperations();
    }, [user, isLocalSessionLocked, resumeOperations, clearSensitiveOperationState]);

    // A previous process may have died before lock/sign-out cleanup ran. Its
    // OperationCenter state is gone, so any surviving file-crypto cache copy is
    // unreferenced and safe to remove on launch.
    useEffect(() => {
        purgeFileCryptoCaches();
        clearLastEncryptedFile();
    }, []);

    // APP-SEC-007: signup secrets live only in the in-process session; discard
    // them when the app backgrounds so they never outlive the signup flow.
    useEffect(() => {
        if (appStateIsBackground) {
            pendingSignupSession.clear();
        }
    }, [appStateIsBackground]);

    // APP-SEC-003 (iOS): screenshots/recording are blocked for the whole
    // process lifetime, mirroring Android's global FLAG_SECURE posture.
    // Global (not user-gated) on purpose: the signup seed display and the
    // sign-in MFA challenge render while user === null, and a vault app
    // loses nothing by blocking capture everywhere.
    useScreenCaptureProtection(true);
    useGlobalSpinner(showStartupLoading || (authCompleted && isCheckingInactivity));
    usePassphraseStorageAutoSync(userDecrypted);
    useStartupUpdateCheck(authCompleted);
    useShareIntentRouting();
    usePgpRuntimeOnUserChange(user, reloadWebView, handlePgpRuntimeCleared);

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
                    {user && userDecrypted && !isLocalSessionLocked ? <OperationCenterUI /> : null}
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
                            <OperationCenterProvider>
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
                            </OperationCenterProvider>
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
