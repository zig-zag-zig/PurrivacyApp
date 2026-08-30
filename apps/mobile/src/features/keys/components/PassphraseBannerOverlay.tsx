import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../../styles/theme';
import { GeneratedBannerContent, StoredBannerContent } from './passphraseBannerOverlay/BannerContent';
import { usePassphraseBannerLayout } from './passphraseBannerOverlay/usePassphraseBannerLayout';
import type {
    PassphraseBannerOverlayContextValue,
    PassphraseBannerRequest,
} from './passphraseBannerOverlay/types';

export type { PassphraseBannerOverlayContextValue, PassphraseBannerRequest } from './passphraseBannerOverlay/types';

const PassphraseBannerOverlayContext = createContext<PassphraseBannerOverlayContextValue | null>(null);

const POINTER_SIZE = 14;

/**
 * Banner orchestration (APP-ARCH-002): owns the active-banner state, the
 * context API and the render tree. Layout measurement, keyboard tracking and
 * fade timing live in usePassphraseBannerLayout; the two banner bodies are
 * dumb components in ./passphraseBannerOverlay/BannerContent.
 */
export const PassphraseBannerOverlayProvider = ({ children }: { children: ReactNode }) => {
    const insets = useSafeAreaInsets();
    const [activeBanner, setActiveBanner] = useState<PassphraseBannerRequest | null>(null);
    const activeBannerIdRef = useRef<string | null>(null);
    const { bannerLayout, bannerHeightRef, opacity, remeasure, resetBannerLayout, viewportRef } = usePassphraseBannerLayout(
        activeBanner,
        insets,
    );

    const hidePassphraseBanner = useCallback((id?: string) => {
        setActiveBanner(currentBanner => {
            if (id && currentBanner?.id !== id) return currentBanner;
            if (!id || currentBanner?.id === id) {
                activeBannerIdRef.current = null;
            }
            return null;
        });
    }, []);

    const showPassphraseBanner = useCallback((request: PassphraseBannerRequest) => {
        if (activeBannerIdRef.current !== request.id) {
            activeBannerIdRef.current = request.id;
            bannerHeightRef.current = 0;
            resetBannerLayout();
        }
        setActiveBanner(request);
    }, [bannerHeightRef, resetBannerLayout]);

    const contextValue = useMemo(() => ({
        hidePassphraseBanner,
        showPassphraseBanner,
    }), [hidePassphraseBanner, showPassphraseBanner]);

    return (
        <PassphraseBannerOverlayContext.Provider value={contextValue}>
            <View style={styles.root}>
                {children}
                <View
                    ref={viewportRef}
                    collapsable={false}
                    pointerEvents="box-none"
                    style={styles.viewport}
                >
                    {activeBanner ? (
                        <Animated.View
                            pointerEvents="auto"
                            onLayout={(event) => {
                                bannerHeightRef.current = event.nativeEvent.layout.height;
                                remeasure();
                            }}
                            style={[
                                styles.banner,
                                {
                                    left: bannerLayout.left,
                                    opacity,
                                    top: bannerLayout.top,
                                    width: bannerLayout.width,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.bannerPointer,
                                    bannerLayout.placement === 'above'
                                        ? styles.bannerPointerAbove
                                        : styles.bannerPointerBelow,
                                    { left: bannerLayout.pointerLeft },
                                ]}
                            />
                            {activeBanner.mode === 'stored' ? (
                                <StoredBannerContent onUse={activeBanner.onUse} />
                            ) : (
                                <GeneratedBannerContent
                                    generatedPassphrase={activeBanner.generatedPassphrase}
                                    onCopy={activeBanner.onCopy}
                                    onOpenSettings={activeBanner.onOpenSettings}
                                    onUse={activeBanner.onUse}
                                    testID={activeBanner.testID}
                                />
                            )}
                        </Animated.View>
                    ) : null}
                </View>
            </View>
        </PassphraseBannerOverlayContext.Provider>
    );
};

export const usePassphraseBannerOverlay = (): PassphraseBannerOverlayContextValue => {
    const context = useContext(PassphraseBannerOverlayContext);
    if (!context) {
        throw new Error('usePassphraseBannerOverlay must be used within PassphraseBannerOverlayProvider');
    }
    return context;
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        position: 'relative',
    },
    viewport: {
        bottom: 0,
        elevation: 9000,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 9000,
    },
    banner: {
        backgroundColor: 'rgba(55, 29, 72, 0.98)',
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        elevation: 12,
        position: 'absolute',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
    },
    bannerPointer: {
        backgroundColor: 'rgba(55, 29, 72, 0.98)',
        borderColor: theme.colors.primary,
        height: POINTER_SIZE,
        position: 'absolute',
        transform: [{ rotate: '45deg' }],
        width: POINTER_SIZE,
    },
    bannerPointerAbove: {
        borderBottomWidth: 1,
        borderRightWidth: 1,
        bottom: -(POINTER_SIZE / 2 + 1),
    },
    bannerPointerBelow: {
        borderLeftWidth: 1,
        borderTopWidth: 1,
        top: -(POINTER_SIZE / 2 + 1),
    },
});
