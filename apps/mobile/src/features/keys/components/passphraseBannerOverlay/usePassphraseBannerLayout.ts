import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Keyboard,
    KeyboardEvent,
    Platform,
    View,
    useWindowDimensions,
} from 'react-native';

import { subscribePassphraseBannerReposition } from '../../../../services/passphraseBannerEvents';
import { computeBannerLayout, emptyLayout } from './bannerLayout';
import type { BannerLayout, PassphraseBannerRequest } from './types';

type UsePassphraseBannerLayoutResult = {
    bannerLayout: BannerLayout;
    bannerHeightRef: React.MutableRefObject<number>;
    opacity: Animated.Value;
    /** Re-runs the latest measurement (used by the banner's onLayout). */
    remeasure: () => void;
    /** Resets the layout to the empty state (used when a new banner is shown). */
    resetBannerLayout: () => void;
    viewportRef: React.MutableRefObject<View | null>;
};

/**
 * Extracted from PassphraseBannerOverlay (APP-ARCH-002) — owns the banner's
 * layout state and all lifecycle/timing effects: anchor measurement, keyboard
 * tracking, reposition-event subscription and the fade animation. The provider
 * keeps only orchestration (active-banner state, context, rendering).
 */
export function usePassphraseBannerLayout(
    activeBanner: PassphraseBannerRequest | null,
    insets: { bottom: number; top: number },
): UsePassphraseBannerLayoutResult {
    const dimensions = useWindowDimensions();
    const [bannerLayout, setBannerLayout] = useState<BannerLayout>(emptyLayout);
    const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
    const bannerHeightRef = useRef(0);
    const viewportRef = useRef<View | null>(null);
    const opacity = useRef(new Animated.Value(0)).current;
    const measureActiveBannerRef = useRef<() => void>(() => {});

    const measureActiveBanner = useCallback(() => {
        if (!activeBanner) return;
        const anchor = activeBanner.anchorRef.current;
        if (!anchor) return;

        const measureAnchor = (
            rootX = 0,
            rootY = 0,
            rootWidth = Dimensions.get('window').width,
            rootHeight = Dimensions.get('window').height,
        ) => {
            anchor.measureInWindow((windowX, windowY, width, height) => {
                const nextLayout = computeBannerLayout({
                    anchorHeight: height,
                    anchorWidth: width,
                    anchorWindowX: windowX,
                    anchorWindowY: windowY,
                    bannerHeight: bannerHeightRef.current,
                    bannerMode: activeBanner.mode,
                    currentPlacement: bannerLayout.width > 0 ? bannerLayout.placement : undefined,
                    insetsBottom: insets.bottom,
                    insetsTop: insets.top,
                    keyboardFallbackEnabled: activeBanner.keyboardFallbackEnabled,
                    keyboardMetricsScreenY: Keyboard.metrics?.()?.screenY,
                    keyboardTop,
                    platformIsAndroid: Platform.OS === 'android',
                    rootHeight,
                    rootWidth,
                    rootX,
                    rootY,
                    windowHeight: Dimensions.get('window').height,
                });

                setBannerLayout(previousLayout => {
                    if (
                        previousLayout.left === nextLayout.left
                        && previousLayout.placement === nextLayout.placement
                        && previousLayout.pointerLeft === nextLayout.pointerLeft
                        && previousLayout.top === nextLayout.top
                        && previousLayout.width === nextLayout.width
                    ) {
                        return previousLayout;
                    }

                    return nextLayout;
                });
            });
        };

        if (viewportRef.current) {
            viewportRef.current.measureInWindow(measureAnchor);
        } else {
            measureAnchor();
        }
    }, [activeBanner, bannerLayout.placement, bannerLayout.width, insets.bottom, insets.top, keyboardTop]);

    useEffect(() => {
        measureActiveBannerRef.current = measureActiveBanner;
    }, [measureActiveBanner]);

    const remeasure = useCallback(() => {
        measureActiveBannerRef.current();
    }, []);

    const resetBannerLayout = useCallback(() => {
        setBannerLayout(emptyLayout);
    }, []);

    // Stable subscription — never tears down/re-registers during scroll
    useEffect(() => {
        return subscribePassphraseBannerReposition(() => {
            measureActiveBannerRef.current();
        });
    }, []);

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: activeBanner ? 1 : 0,
            duration: activeBanner ? 160 : 100,
            useNativeDriver: true,
        }).start();

        if (activeBanner) {
            measureActiveBanner();
            const timeout = setTimeout(measureActiveBanner, 80);
            return () => clearTimeout(timeout);
        }

        return undefined;
    }, [activeBanner, measureActiveBanner, opacity]);

    useEffect(() => {
        if (activeBanner) {
            measureActiveBanner();
        }
    }, [activeBanner, dimensions.height, dimensions.width, measureActiveBanner]);

    useEffect(() => {
        if (!activeBanner) return undefined;

        const handleKeyboardFrame = (event: KeyboardEvent) => {
            setKeyboardTop(event.endCoordinates.screenY);
        };
        const handleKeyboardHide = () => {
            setKeyboardTop(null);
        };

        const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardFrame);
        const frameSubscription = Keyboard.addListener('keyboardDidChangeFrame', handleKeyboardFrame);
        const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

        return () => {
            showSubscription.remove();
            frameSubscription.remove();
            hideSubscription.remove();
        };
    }, [activeBanner]);

    useEffect(() => {
        if (activeBanner) {
            measureActiveBanner();
        }
    }, [activeBanner, keyboardTop, measureActiveBanner]);

    return {
        bannerLayout,
        bannerHeightRef,
        opacity,
        remeasure,
        resetBannerLayout,
        viewportRef,
    };
}
