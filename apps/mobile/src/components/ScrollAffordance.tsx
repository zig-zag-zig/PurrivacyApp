import React, { useCallback, useRef, useState } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { theme } from '../styles/theme';
import { useOverlayDockClearance } from './overlayDock';

/**
 * Floating scroll affordances for long, scrolling screens.
 *
 * The rules are the ones Pawify settled on, kept identical here so both apps
 * behave the same:
 *
 * - "Top" needs a real run above the viewport (SHOW_AFTER_PX), so short
 *   screens never grow a button that does nothing.
 * - "Bottom" needs a meaningful run left below the viewport
 *   (MIN_BOTTOM_DISTANCE_PX). Otherwise a screen that is only a few rows taller
 *   than the window would show two buttons offering the same tiny jump.
 * - Each button is decided by the run in *its own* direction only: a freshly
 *   loaded long screen shows "bottom" right away, and content scrolled to its
 *   end shows only "top".
 *
 * The geometry comes from three sources because content can change without the
 * user moving: scroll events carry offset *and* content/viewport size,
 * `onContentSizeChange` carries a new content height, and `onLayout` carries a
 * new viewport height. Deriving everything from scroll events alone made the
 * bottom button lag one nudge behind every content growth (an expansion, a
 * decrypted result arriving, a keyboard spacer).
 *
 * Placement: a bottom-right column inside the screen's own padding and above
 * the operation center's activity button when it is on screen, with a fixed
 * slot per button, so the two never overlap, never sit on top of a row's tap
 * target in the middle of the screen, and never shift when only one is visible.
 */
const SHOW_AFTER_PX = 320;
const MIN_BOTTOM_DISTANCE_PX = 600;

/** Base gap between the rail and the bottom of the scrolling surface. */
export const SCROLL_RAIL_BASE_OFFSET = theme.spacing.md;
/** Height of one button plus the gap between the two slots. */
const SLOT_SIZE = 44;
const SLOT_GAP = 10;
const RAIL_HEIGHT = SLOT_SIZE * 2 + SLOT_GAP;

/**
 * Right inset of the rail. Matches the operation center's activity button
 * (16) so the two share a column when both are on screen.
 */
const SCROLL_RAIL_RIGHT_INSET = 16;

/**
 * End-of-content padding so the rail never parks on the last row.
 *
 * ScreenContainer/ScreenList already apply it, so screens only need this when
 * they own their own scroll container (e.g. a modal's list). It tracks the
 * rail's resolved bottom because a lifted rail covers more content: when the
 * operation center's button pushes the rail up, the reservation has to grow
 * with it, or the last rows end up underneath the buttons.
 */
export const useScrollRailContentInset = (
    bottomOffset = SCROLL_RAIL_BASE_OFFSET,
): number => useOverlayDockClearance(bottomOffset) + SLOT_SIZE * 2 + SLOT_GAP;

export type ScrollMetrics = {
    offsetY: number;
    contentHeight: number;
    viewportHeight: number;
};

type ScrollFlags = {
    showScrollToTop: boolean;
    showScrollToBottom: boolean;
};

const decide = ({ offsetY, contentHeight, viewportHeight }: ScrollMetrics): ScrollFlags => {
    // Nothing is measurable until the viewport itself has laid out; a content
    // height arriving first would otherwise look like an infinitely long screen.
    if (viewportHeight <= 0) {
        return { showScrollToTop: false, showScrollToBottom: false };
    }

    const scrollableHeight = Math.max(0, contentHeight - viewportHeight);
    // An offset beyond the current end cannot be where the user is: the content
    // shrank (a replaced screen, removed rows) around them, so they are at the
    // end now. Capping the offset for the *decision* only — instead of
    // rewriting the stored geometry — keeps a transient dip in the reported
    // content height recoverable: the next scroll event is authoritative
    // either way.
    const offsetFromTop = Math.min(offsetY, scrollableHeight);

    return {
        showScrollToTop: offsetFromTop > SHOW_AFTER_PX,
        showScrollToBottom: scrollableHeight - offsetFromTop > MIN_BOTTOM_DISTANCE_PX,
    };
};

export const useScrollAffordance = () => {
    // Latest geometry lives in a ref: every event is authoritative, so a
    // decision can never be recomputed from the stale snapshot that the last
    // *rendered* one left.
    const metricsRef = useRef<ScrollMetrics>({ offsetY: 0, contentHeight: 0, viewportHeight: 0 });
    const [flags, setFlags] = useState<ScrollFlags>(() => decide(metricsRef.current));

    const applyMetrics = useCallback((next: Partial<ScrollMetrics>) => {
        const merged: ScrollMetrics = { ...metricsRef.current, ...next };
        metricsRef.current = merged;

        const decided = decide(merged);
        // Scroll and layout churn fire constantly; re-render only on a flip.
        setFlags((previous) => (
            previous.showScrollToTop === decided.showScrollToTop &&
            previous.showScrollToBottom === decided.showScrollToBottom
                ? previous
                : decided
        ));
    }, []);

    const onScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            applyMetrics({
                offsetY: contentOffset.y,
                contentHeight: contentSize.height,
                viewportHeight: layoutMeasurement.height,
            });
        },
        [applyMetrics],
    );

    const onContentSizeChange = useCallback(
        (_width: number, height: number) => applyMetrics({ contentHeight: height }),
        [applyMetrics],
    );

    const onViewportLayout = useCallback(
        (event: LayoutChangeEvent) =>
            applyMetrics({ viewportHeight: event.nativeEvent.layout.height }),
        [applyMetrics],
    );

    return {
        showScrollToTop: flags.showScrollToTop,
        showScrollToBottom: flags.showScrollToBottom,
        onScroll,
        onContentSizeChange,
        onViewportLayout,
        scrollEventThrottle: 32,
    };
};

export type ScrollAffordanceApi = ReturnType<typeof useScrollAffordance>;

type ScrollButtonsProps = {
    showScrollToTop: boolean;
    showScrollToBottom?: boolean;
    onScrollToTop: () => void;
    onScrollToBottom?: () => void;
    /**
     * Distance from the bottom edge of the scrolling surface. The default
     * keeps the rail inside the screen padding; screens with their own fixed
     * bottom bar pass a larger value. When the operation center's activity
     * button is on screen the rail is lifted above it automatically, so this
     * never has to account for that overlay.
     */
    bottomOffset?: number;
    testIDPrefix?: string;
};

const ScrollButtons = ({
    showScrollToTop,
    showScrollToBottom = false,
    onScrollToTop,
    onScrollToBottom,
    bottomOffset = SCROLL_RAIL_BASE_OFFSET,
    testIDPrefix = 'purrivacy.scroll',
}: ScrollButtonsProps) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const visible = showScrollToTop || (showScrollToBottom && Boolean(onScrollToBottom));
    const resolvedBottom = useOverlayDockClearance(bottomOffset);

    React.useEffect(() => {
        Animated.timing(opacity, {
            toValue: visible ? 1 : 0,
            duration: 140,
            useNativeDriver: true,
        }).start();
    }, [opacity, visible]);

    if (!visible) {
        return null;
    }

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[localStyles.column, { bottom: resolvedBottom, opacity }]}
        >
            {/* Each button owns a fixed slot instead of flowing in a column:
                when the bottom button goes away the top one slid down into its
                place, which made it look like a different control.
                pointerEvents="box-none" on the slots: an empty slot must not
                swallow taps on the content underneath it — only the button
                itself is touchable. */}
            <View style={localStyles.slot} pointerEvents="box-none">
                {showScrollToTop && (
                    <Pressable
                        onPress={onScrollToTop}
                        accessibilityRole="button"
                        accessibilityLabel="Scroll back to the top"
                        hitSlop={8}
                        testID={`${testIDPrefix}.top`}
                        style={({ pressed }) => [localStyles.button, pressed && localStyles.pressed]}
                    >
                        <Icon name="keyboard-arrow-up" size={22} color={theme.colors.text} />
                    </Pressable>
                )}
            </View>
            <View style={[localStyles.slot, localStyles.bottomSlot]} pointerEvents="box-none">
                {showScrollToBottom && onScrollToBottom && (
                    <Pressable
                        onPress={onScrollToBottom}
                        accessibilityRole="button"
                        accessibilityLabel="Scroll to the end of the page"
                        hitSlop={8}
                        testID={`${testIDPrefix}.bottom`}
                        style={({ pressed }) => [localStyles.button, pressed && localStyles.pressed]}
                    >
                        <Icon name="keyboard-arrow-down" size={22} color={theme.colors.text} />
                    </Pressable>
                )}
            </View>
        </Animated.View>
    );
};

const localStyles = StyleSheet.create({
    column: {
        position: 'absolute',
        // Same right inset as the operation center's activity button, so when
        // both are visible they read as one vertical stack in the corner
        // instead of two staggered columns.
        right: SCROLL_RAIL_RIGHT_INSET,
        alignItems: 'center',
        // Above list content and the passphrase banner, below modals.
        zIndex: 20,
        elevation: 20,
    },
    slot: {
        // Fixed footprint: an empty slot still reserves the button's space.
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomSlot: {
        marginTop: SLOT_GAP,
    },
    button: {
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        borderRadius: SLOT_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.dividerStrong,
        // Keeps the pill readable over dense key/material blocks.
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
    },
    pressed: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primaryStrong,
    },
});

export default ScrollButtons;
