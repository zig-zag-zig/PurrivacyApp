import React from 'react';
import {
    Dimensions,
    Keyboard,
    KeyboardEvent,
    Platform,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    KeyboardAwareInputNode,
} from './KeyboardAwareScrollContext';
import {
    resolveAdditionalKeyboardSpacer,
    resolveKeyboardAwareScrollY,
} from './keyboardAwareScroll';
import { usePassphraseBannerScrollEvents } from './usePassphraseBannerScrollEvents';

const EXTRA_KEYBOARD_GAP = 24;
const KEYBOARD_INPUT_CLEARANCE = 104;
const FOCUS_SCROLL_DELAY_MS = 520;
const KEYBOARD_FRAME_SCROLL_DELAY_MS = 90;

const getFallbackKeyboardHeight = (windowHeight: number): number => (
    Math.max(320, Math.round(windowHeight * 0.42))
);

/**
 * The minimal scroller surface the keyboard-aware engine needs. Both ScrollView
 * (via ScreenContainer) and FlatList (via ScreenList) satisfy this through a
 * small adapter — FlatList scrolls with `scrollToOffset` and exposes its inner
 * ScrollView via `getScrollRef()` for `measureInWindow`.
 */
export interface ScreenScrollHandle {
    /** Scroll so content offset `y` is at the top. */
    scrollToY: (y: number, animated: boolean) => void;
    /** Measure the scrollable viewport in window coordinates. */
    measureInWindow: (
        callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
}

export interface ScreenScrollEngineProps
    extends Pick<
        ScrollViewProps,
        | 'onContentSizeChange'
        | 'onLayout'
        | 'onScroll'
        | 'onTouchStart'
        | 'onTouchMove'
        | 'onTouchEnd'
    > {
    children?: React.ReactNode;
}

export interface ScreenScrollEngine {
    /** Attach to the scroll component's ref. The adapter must produce a
     * ScreenScrollHandle. */
    attachRef: (handle: ScreenScrollHandle | null) => void;
    keyboardBottomSpacer: number;
    /** Spread onto the ScrollView/FlatList. Includes onScroll, onContentSizeChange,
     * onLayout and the passphrase-banner touch handlers. */
    scrollProps: {
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
        onContentSizeChange: (width: number, height: number) => void;
        onLayout: ScrollViewProps['onLayout'];
        onTouchStart: ScrollViewProps['onTouchStart'];
        onTouchMove: ScrollViewProps['onTouchMove'];
        onTouchEnd: ScrollViewProps['onTouchEnd'];
    };
    /** Provider value — wrap children so inputs can request scroll-into-view. */
    contextValue: { scrollInputIntoView: (node: KeyboardAwareInputNode | null) => void };
}

/**
 * Shared keyboard-aware scroll engine for ScreenContainer (ScrollView) and
 * ScreenList (FlatList). Extracted so the virtualized list inherits identical
 * focus-tracking, keyboard-spacer and passphrase-banner behavior instead of
 * forking it.
 */
export function useScreenScrollEngine(props: ScreenScrollEngineProps): ScreenScrollEngine {
    const {
        onContentSizeChange,
        onLayout,
        onScroll,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
    } = props;
    const insets = useSafeAreaInsets();
    const scrollRef = React.useRef<ScreenScrollHandle | null>(null);
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

    const attachRef = React.useCallback((handle: ScreenScrollHandle | null) => {
        scrollRef.current = handle;
    }, []);

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
            scrollRef.current?.scrollToY(y, true);
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
        const scrollNode = scrollRef.current;

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

    const contextValue = React.useMemo(() => ({
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

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
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

    return {
        attachRef,
        keyboardBottomSpacer,
        contextValue,
        scrollProps: {
            onScroll: handleScroll,
            onContentSizeChange: handleContentSizeChange,
            onLayout: handleLayout,
            onTouchStart: bannerScrollEvents.handleTouchStart,
            onTouchMove: bannerScrollEvents.handleTouchMove,
            onTouchEnd: bannerScrollEvents.handleTouchEnd,
        },
    };
}
