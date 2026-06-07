import React from 'react';
import {
    Dimensions,
    Keyboard,
    KeyboardEvent,
    Platform,
    ScrollView,
    View,
    ScrollViewProps,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import {
    KeyboardAwareInputNode,
    KeyboardAwareScrollContext,
} from './KeyboardAwareScrollContext';
import {
    resolveAdditionalKeyboardSpacer,
    resolveKeyboardAwareScrollY,
} from './keyboardAwareScroll';
import { usePassphraseBannerScrollEvents } from './usePassphraseBannerScrollEvents';

interface ScreenContainerProps extends ScrollViewProps {
    children: React.ReactNode;
    safeArea?: boolean;
}

const EXTRA_KEYBOARD_GAP = 24;
const KEYBOARD_INPUT_CLEARANCE = 104;
const FOCUS_SCROLL_DELAY_MS = 520;
const KEYBOARD_FRAME_SCROLL_DELAY_MS = 90;

const getFallbackKeyboardHeight = (windowHeight: number): number => (
    Math.max(320, Math.round(windowHeight * 0.42))
);

export const ScreenContainer = React.forwardRef<ScrollView, ScreenContainerProps>(
    ({
        children,
        style,
        contentContainerStyle,
        keyboardShouldPersistTaps,
        onContentSizeChange,
        onLayout,
        onScroll,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        scrollEventThrottle,
        ...props
    }, ref) => {
        const insets = useSafeAreaInsets();
        const scrollRef = React.useRef<ScrollView | null>(null);
        const contentHeightRef = React.useRef(0);
        const focusedInputRef = React.useRef<KeyboardAwareInputNode | null>(null);
        const currentScrollYRef = React.useRef(0);
        const lastKeyboardHeightRef = React.useRef(0);
        const scrollFrameRef = React.useRef<number | null>(null);
        const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
        const viewportHeightRef = React.useRef(0);
        const [keyboardBottomSpacer, setKeyboardBottomSpacer] = React.useState(0);
        const bannerScrollEvents = usePassphraseBannerScrollEvents({
            onScroll,
            onTouchEnd,
            onTouchMove,
            onTouchStart,
        });

        const assignScrollRef = React.useCallback((node: ScrollView | null) => {
            scrollRef.current = node;
            if (typeof ref === 'function') {
                ref(node);
            } else if (ref) {
                ref.current = node;
            }
        }, [ref]);

        const clearScrollTimeouts = React.useCallback(() => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
                scrollTimeoutRef.current = null;
            }
            if (scrollFrameRef.current !== null) {
                cancelAnimationFrame(scrollFrameRef.current);
                scrollFrameRef.current = null;
            }
        }, []);

        const getKeyboardFrame = React.useCallback(() => {
            const windowHeight = Dimensions.get('window').height;
            const metrics = Keyboard.metrics?.();
            const metricsHeight = metrics?.height ?? 0;

            if (metricsHeight > 0) {
                return {
                    height: metricsHeight,
                    top: metrics?.screenY ?? windowHeight - metricsHeight,
                };
            }

            if (lastKeyboardHeightRef.current > 0) {
                return {
                    height: lastKeyboardHeightRef.current,
                    top: windowHeight - lastKeyboardHeightRef.current,
                };
            }

            if (Platform.OS === 'android' && focusedInputRef.current) {
                const fallbackHeight = getFallbackKeyboardHeight(windowHeight);
                return {
                    height: fallbackHeight,
                    top: windowHeight - fallbackHeight,
                };
            }

            return null;
        }, []);

        const syncKeyboardFrame = React.useCallback((frame = getKeyboardFrame()) => {
            if (!frame || frame.height <= 0) {
                return null;
            }

            lastKeyboardHeightRef.current = frame.height;
            return frame;
        }, [getKeyboardFrame]);

        const scrollToY = React.useCallback((y: number, afterLayout = false) => {
            const scroll = () => {
                scrollFrameRef.current = null;
                scrollRef.current?.scrollTo({ y, animated: true });
            };

            if (!afterLayout) {
                scroll();
                return;
            }

            if (scrollFrameRef.current !== null) {
                cancelAnimationFrame(scrollFrameRef.current);
            }
            scrollFrameRef.current = requestAnimationFrame(scroll);
        }, []);

        const scrollFocusedInputIntoView = React.useCallback(() => {
            const focusedInput = focusedInputRef.current;
            if (!focusedInput) return;

            const frame = syncKeyboardFrame();
            const windowHeight = Dimensions.get('window').height;
            const scrollNode = scrollRef.current as KeyboardAwareInputNode | null;

            const measureFocusedInput = (viewportTop = 0, viewportHeight = windowHeight) => {
                const visibleTop = Math.max(
                    viewportTop,
                    insets.top,
                ) + EXTRA_KEYBOARD_GAP;
                const visibleBottom = Math.min(
                    frame?.top ?? windowHeight,
                    viewportTop + viewportHeight,
                ) - KEYBOARD_INPUT_CLEARANCE;

                focusedInput.measureInWindow((_x, y, _width, height) => {
                    const nextScrollY = resolveKeyboardAwareScrollY({
                        currentScrollY: currentScrollYRef.current,
                        inputBottom: y + height,
                        inputTop: y,
                        visibleBottom,
                        visibleTop,
                    });

                    if (Math.abs(nextScrollY - currentScrollYRef.current) <= 1) return;

                    const additionalSpacer = resolveAdditionalKeyboardSpacer({
                        contentHeight: contentHeightRef.current,
                        targetScrollY: nextScrollY,
                        viewportHeight: viewportHeightRef.current,
                    });

                    if (additionalSpacer > 0) {
                        setKeyboardBottomSpacer(current => current + additionalSpacer);
                        scrollToY(nextScrollY, true);
                        return;
                    }

                    scrollToY(nextScrollY);
                });
            };

            if (scrollNode?.measureInWindow) {
                scrollNode.measureInWindow((_x, y, _width, height) => {
                    measureFocusedInput(y, height);
                });
                return;
            }

            measureFocusedInput();
        }, [insets.top, scrollToY, syncKeyboardFrame]);

        const scheduleFocusedInputScroll = React.useCallback((delay: number) => {
            clearScrollTimeouts();
            const timeout = setTimeout(() => {
                scrollTimeoutRef.current = null;
                scrollFocusedInputIntoView();
            }, delay);
            scrollTimeoutRef.current = timeout;
        }, [clearScrollTimeouts, scrollFocusedInputIntoView]);

        const scrollInputIntoView = React.useCallback((node: KeyboardAwareInputNode | null) => {
            focusedInputRef.current = node;
            if (!node) return;

            syncKeyboardFrame();
            scheduleFocusedInputScroll(FOCUS_SCROLL_DELAY_MS);
        }, [scheduleFocusedInputScroll, syncKeyboardFrame]);

        const keyboardAwareScrollContextValue = React.useMemo(() => ({
            scrollInputIntoView,
        }), [scrollInputIntoView]);

        React.useEffect(() => {
            const handleKeyboardFrame = (event: KeyboardEvent) => {
                const windowHeight = Dimensions.get('window').height;
                const eventHeight = event.endCoordinates?.height ?? 0;
                const screenY = event.endCoordinates?.screenY ?? windowHeight - eventHeight;
                const height = Math.max(eventHeight, windowHeight - screenY, 0);

                const fallbackHeight = getFallbackKeyboardHeight(windowHeight);
                lastKeyboardHeightRef.current = height || fallbackHeight;
                scheduleFocusedInputScroll(KEYBOARD_FRAME_SCROLL_DELAY_MS);
            };
            const handleKeyboardHide = () => {
                lastKeyboardHeightRef.current = 0;
                setKeyboardBottomSpacer(0);
                clearScrollTimeouts();
            };

            const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardFrame);
            const frameSubscription = Keyboard.addListener('keyboardDidChangeFrame', handleKeyboardFrame);
            const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

            return () => {
                showSubscription.remove();
                frameSubscription.remove();
                hideSubscription.remove();
            };
        }, [clearScrollTimeouts, scheduleFocusedInputScroll]);

        React.useEffect(() => () => {
            clearScrollTimeouts();
        }, [clearScrollTimeouts]);

        const handleScroll = (event: Parameters<typeof bannerScrollEvents.handleScroll>[0]) => {
            currentScrollYRef.current = event.nativeEvent.contentOffset.y;
            bannerScrollEvents.handleScroll(event);
        };

        const handleContentSizeChange = (width: number, height: number) => {
            contentHeightRef.current = height;
            onContentSizeChange?.(width, height);
        };

        const handleLayout: NonNullable<ScrollViewProps['onLayout']> = (event) => {
            viewportHeightRef.current = event.nativeEvent.layout.height;
            onLayout?.(event);
        };

        return (
            <View style={commonStyles.container}>
                <KeyboardAwareScrollContext.Provider value={keyboardAwareScrollContextValue}>
                    <View style={commonStyles.flex}>
                    <ScrollView
                        {...props}
                        ref={assignScrollRef}
                        style={[commonStyles.flex, style]}
                        contentContainerStyle={[
                            commonStyles.p,
                            styles.content,
                            contentContainerStyle,
                            keyboardBottomSpacer > 0 && {
                                paddingBottom: keyboardBottomSpacer + theme.spacing.xl,
                            },
                        ]}
                        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
                        keyboardDismissMode={props.keyboardDismissMode ?? 'none'}
                        scrollEventThrottle={scrollEventThrottle ?? 16}
                        onContentSizeChange={handleContentSizeChange}
                        onLayout={handleLayout}
                        onScroll={handleScroll}
                        onTouchStart={bannerScrollEvents.handleTouchStart}
                        onTouchMove={bannerScrollEvents.handleTouchMove}
                        onTouchEnd={bannerScrollEvents.handleTouchEnd}
                    >
                        {children}
                    </ScrollView>
                    </View>
                </KeyboardAwareScrollContext.Provider>
            </View>
        );
    }
);

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
    },
});
