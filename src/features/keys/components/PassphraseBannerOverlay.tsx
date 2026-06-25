import Icon from '@expo/vector-icons/MaterialIcons';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Keyboard,
    KeyboardEvent,
    Platform,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomText } from '../../../components/CustomText';
import { theme } from '../../../styles/theme';
import { subscribePassphraseBannerReposition } from '../../../services/passphraseBannerEvents';
import { resolvePassphraseBannerPlacement } from '../domain/passphraseBannerPlacement';
import type { PassphraseBannerPlacement } from '../domain/passphraseBannerPlacement';

type PassphraseBannerMode = 'stored' | 'generate';

type PassphraseBannerAnchor = {
    measureInWindow: (
        callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
};

type PassphraseBannerRequest = {
    anchorRef: React.RefObject<PassphraseBannerAnchor | null>;
    generatedPassphrase?: string;
    id: string;
    keyboardFallbackEnabled?: boolean;
    mode: PassphraseBannerMode;
    onCopy?: () => void;
    onOpenSettings?: () => void;
    onUse: () => void;
    testID?: string;
};

type PassphraseBannerOverlayContextValue = {
    hidePassphraseBanner: (id?: string) => void;
    showPassphraseBanner: (request: PassphraseBannerRequest) => void;
};

const PassphraseBannerOverlayContext = createContext<PassphraseBannerOverlayContextValue | null>(null);

const BANNER_GAP = 14;
const POINTER_SIZE = 14;
const COMPACT_BANNER_HEIGHT = 48;
const GENERATOR_BANNER_HEIGHT = 64;
const BANNER_SCREEN_MARGIN = 8;
const BANNER_VIEWPORT_CLEARANCE = theme.spacing.xl;

const getFallbackKeyboardHeight = (windowHeight: number): number => (
    Math.max(320, Math.round(windowHeight * 0.42))
);

const clamp = (value: number, min: number, max: number): number => (
    Math.max(min, Math.min(value, max))
);

type BannerLayout = {
    left: number;
    placement: PassphraseBannerPlacement;
    pointerLeft: number;
    top: number;
    width: number;
};

const emptyLayout: BannerLayout = {
    left: BANNER_SCREEN_MARGIN,
    placement: 'below',
    pointerLeft: 0,
    top: 0,
    width: 0,
};

export const PassphraseBannerOverlayProvider = ({ children }: { children: ReactNode }) => {
    const insets = useSafeAreaInsets();
    const dimensions = useWindowDimensions();
    const [activeBanner, setActiveBanner] = useState<PassphraseBannerRequest | null>(null);
    const [bannerLayout, setBannerLayout] = useState<BannerLayout>(emptyLayout);
    const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
    const bannerHeightRef = useRef(0);
    const activeBannerIdRef = useRef<string | null>(null);
    const opacity = useRef(new Animated.Value(0)).current;
    const viewportRef = useRef<View | null>(null);
    const measureActiveBannerRef = useRef<() => void>(() => {});

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
            setBannerLayout(emptyLayout);
        }
        setActiveBanner(request);
    }, []);

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
                const windowHeight = Dimensions.get('window').height;
                const fallbackKeyboardHeight = getFallbackKeyboardHeight(windowHeight);
                const viewportBottom = rootY + rootHeight;
                const viewportUsesFullWindow = rootHeight >= windowHeight - BANNER_SCREEN_MARGIN * 2;
                const fallbackKeyboardTop = viewportUsesFullWindow
                    ? windowHeight - fallbackKeyboardHeight
                    : viewportBottom;
                const estimatedHeight = activeBanner.mode === 'generate'
                    ? GENERATOR_BANNER_HEIGHT
                    : COMPACT_BANNER_HEIGHT;
                const bannerHeight = bannerHeightRef.current || estimatedHeight;
                const visibleTop = Math.max(
                    BANNER_SCREEN_MARGIN,
                    insets.top - rootY + BANNER_SCREEN_MARGIN,
                );
                const metricsKeyboardTop = Keyboard.metrics?.()?.screenY;
                const visibleBottom = Math.min(
                    keyboardTop
                        ?? metricsKeyboardTop
                        ?? (
                            Platform.OS === 'android' && activeBanner.keyboardFallbackEnabled
                                ? fallbackKeyboardTop
                                : viewportBottom
                        ),
                    viewportBottom - insets.bottom,
                ) - rootY - BANNER_SCREEN_MARGIN;
                const x = windowX - rootX;
                const y = windowY - rootY;
                const inputTop = y;
                const inputBottom = y + height;
                const placement = resolvePassphraseBannerPlacement({
                    bannerHeight,
                    currentPlacement: bannerLayout.width > 0 ? bannerLayout.placement : undefined,
                    gap: BANNER_GAP,
                    inputBottom,
                    inputTop,
                    viewportClearance: BANNER_VIEWPORT_CLEARANCE,
                    visibleBottom,
                    visibleTop,
                });
                const bannerWidth = Math.max(0, Math.min(width, rootWidth - BANNER_SCREEN_MARGIN * 2));
                const left = clamp(
                    x,
                    BANNER_SCREEN_MARGIN,
                    Math.max(BANNER_SCREEN_MARGIN, rootWidth - bannerWidth - BANNER_SCREEN_MARGIN),
                );
                const candidateTop = placement === 'above'
                    ? inputTop - BANNER_GAP - bannerHeight
                    : inputBottom + BANNER_GAP;
                const top = clamp(
                    candidateTop,
                    visibleTop,
                    Math.max(visibleTop, visibleBottom - bannerHeight),
                );
                const anchorCenterX = x + width / 2;
                const pointerLeft = clamp(
                    anchorCenterX - left - POINTER_SIZE / 2,
                    POINTER_SIZE,
                    Math.max(POINTER_SIZE, bannerWidth - POINTER_SIZE * 2),
                );

                setBannerLayout(previousLayout => {
                    const nextLayout = {
                        left,
                        placement,
                        pointerLeft,
                        top,
                        width: bannerWidth,
                    };

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
                                measureActiveBanner();
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
                                <Pressable
                                    onPress={activeBanner.onUse}
                                    style={styles.autofillContent}
                                    accessibilityRole="button"
                                    accessibilityLabel="Autofill passphrase"
                                >
                                    <View style={styles.autofillIcon}>
                                        <Icon name="vpn-key" size={18} color={theme.colors.text} />
                                    </View>
                                    <CustomText style={styles.autofillText} numberOfLines={1}>
                                        Autofill passphrase
                                    </CustomText>
                                </Pressable>
                            ) : (
                                <Pressable
                                    testID={activeBanner.testID ? `${activeBanner.testID}.generated.use` : undefined}
                                    onPress={activeBanner.onUse}
                                    style={styles.generatorContent}
                                    accessibilityRole="button"
                                    accessibilityLabel="Use generated passphrase"
                                >
                                    <View style={styles.generatedTextColumn}>
                                        <CustomText style={styles.generatorTitle} numberOfLines={1}>
                                            Generated passphrase
                                        </CustomText>
                                        <CustomText
                                            testID={activeBanner.testID ? `${activeBanner.testID}.generated.text` : undefined}
                                            style={styles.generatedPassphrase}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                        >
                                            {activeBanner.generatedPassphrase || 'Generating...'}
                                        </CustomText>
                                    </View>

                                    <View style={styles.generatorActions}>
                                        <Pressable
                                            testID={activeBanner.testID ? `${activeBanner.testID}.generated.settings` : undefined}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                activeBanner.onOpenSettings?.();
                                            }}
                                            style={styles.bannerIconButton}
                                            accessibilityRole="button"
                                            accessibilityLabel="Generated passphrase settings"
                                            hitSlop={8}
                                        >
                                            <Icon name="edit" size={18} color={theme.colors.primary} />
                                        </Pressable>
                                        <Pressable
                                            testID={activeBanner.testID ? `${activeBanner.testID}.generated.copy` : undefined}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                activeBanner.onCopy?.();
                                            }}
                                            style={styles.bannerIconButton}
                                            accessibilityRole="button"
                                            accessibilityLabel="Copy generated passphrase"
                                            hitSlop={8}
                                        >
                                            <Icon name="content-copy" size={18} color={theme.colors.primary} />
                                        </Pressable>
                                    </View>
                                </Pressable>
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
    autofillContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: COMPACT_BANNER_HEIGHT,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    autofillIcon: {
        alignItems: 'center',
        backgroundColor: 'rgba(18, 18, 18, 0.32)',
        borderRadius: 999,
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
    autofillText: {
        color: theme.colors.text,
        flex: 1,
        fontSize: theme.typography.body.fontSize,
        fontWeight: '700',
        lineHeight: 20,
    },
    generatorContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: GENERATOR_BANNER_HEIGHT,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    generatedTextColumn: {
        flex: 1,
        minWidth: 0,
    },
    generatorTitle: {
        color: theme.colors.primary,
        fontSize: theme.typography.caption.fontSize,
        fontWeight: '700',
        lineHeight: 16,
    },
    generatedPassphrase: {
        color: theme.colors.text,
        fontSize: theme.typography.label.fontSize,
        lineHeight: 18,
        marginTop: 2,
    },
    generatorActions: {
        flexDirection: 'row',
        flexShrink: 0,
        gap: theme.spacing.xs,
        justifyContent: 'flex-end',
    },
    bannerIconButton: {
        alignItems: 'center',
        borderRadius: 999,
        height: 34,
        justifyContent: 'center',
        width: 34,
    },
});
