import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

vi.mock('react-native', () => {
    class AnimatedValue {
        setValue() {}
    }

    return {
        Animated: {
            Value: AnimatedValue,
            timing: () => ({ start: () => {} }),
            View: 'Animated.View',
        },
        Pressable: 'Pressable',
        StyleSheet: { create: (s: Record<string, unknown>) => s },
        View: 'View',
    };
});

vi.mock('@expo/vector-icons/MaterialIcons', () => ({ default: () => null }));
vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../styles/theme', () => ({
    theme: {
        colors: {},
        spacing: { md: 16, lg: 24 },
    },
}));

import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import {
    resolveOverlayDockBottom,
    type OverlayDock,
} from './overlayDock';
import { useScrollAffordance, type ScrollAffordanceApi } from './ScrollAffordance';

type Geometry = {
    offsetY?: number;
    contentHeight?: number;
    viewportHeight?: number;
};

/** The scroll event carries the whole geometry, exactly as the platform does. */
const scrollEvent = ({
    offsetY = 0,
    contentHeight = 0,
    viewportHeight = 0,
}: Geometry): NativeSyntheticEvent<NativeScrollEvent> =>
    ({
        nativeEvent: {
            contentOffset: { x: 0, y: offsetY },
            contentSize: { width: 400, height: contentHeight },
            layoutMeasurement: { width: 400, height: viewportHeight },
        },
    }) as unknown as NativeSyntheticEvent<NativeScrollEvent>;

const layoutEvent = (viewportHeight: number): LayoutChangeEvent =>
    ({
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: viewportHeight } },
    }) as unknown as LayoutChangeEvent;

const SCREEN = 800;

/** Minimal hook renderer (this repo does not ship @testing-library). */
const renderAffordanceHook = () => {
    const latest: { current: ScrollAffordanceApi | null } = { current: null };

    function Probe() {
        latest.current = useScrollAffordance();
        return null;
    }

    let renderer: ReturnType<typeof create>;
    act(() => {
        renderer = create(<Probe />);
    });

    return {
        get result() {
            if (!latest.current) throw new Error('hook not rendered');
            return latest.current;
        },
        unmount: () => act(() => renderer.unmount()),
    };
};

let hooks: Array<ReturnType<typeof renderAffordanceHook>> = [];

const setup = () => {
    const rendered = renderAffordanceHook();
    hooks.push(rendered);
    return rendered;
};

afterEach(() => {
    hooks.forEach((hook) => hook.unmount());
    hooks = [];
});

describe('useScrollAffordance', () => {
    it('shows nothing before the viewport has laid out', () => {
        const hook = setup();

        act(() => hook.result.onContentSizeChange(400, 5000));

        expect(hook.result.showScrollToTop).toBe(false);
        expect(hook.result.showScrollToBottom).toBe(false);
    });

    it('offers the bottom button as soon as a tall screen lays out, with no scroll yet', () => {
        const hook = setup();

        act(() => hook.result.onViewportLayout(layoutEvent(SCREEN)));
        act(() => hook.result.onContentSizeChange(400, 4000));

        expect(hook.result.showScrollToTop).toBe(false);
        expect(hook.result.showScrollToBottom).toBe(true);
    });

    it('counts content appended while the user sits at the top', () => {
        const hook = setup();

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 0, contentHeight: 900, viewportHeight: SCREEN })));
        expect(hook.result.showScrollToBottom).toBe(false);

        act(() => hook.result.onContentSizeChange(400, 3000));
        expect(hook.result.showScrollToBottom).toBe(true);
    });

    it('keeps the bottom button hidden for content only slightly taller than the screen', () => {
        const hook = setup();

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 0, contentHeight: SCREEN + 200, viewportHeight: SCREEN })));

        expect(hook.result.showScrollToBottom).toBe(false);
    });

    it('drops the bottom button at the end of the content and keeps the top one', () => {
        const hook = setup();

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 400, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(hook.result.showScrollToTop).toBe(true);
        expect(hook.result.showScrollToBottom).toBe(true);

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 3200, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(hook.result.showScrollToTop).toBe(true);
        expect(hook.result.showScrollToBottom).toBe(false);
    });

    it('clamps a stale offset when the content shrinks, so the top button does not stick', () => {
        const hook = setup();

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 2000, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(hook.result.showScrollToTop).toBe(true);

        // A new screen replaces the content; the platform reports the smaller
        // content height before the resulting scroll, so the offset has to be
        // capped here.
        act(() => hook.result.onContentSizeChange(400, 1000));

        expect(hook.result.showScrollToTop).toBe(false);
        expect(hook.result.showScrollToBottom).toBe(false);
    });

    it('recovers the top button when a transient content dip is corrected, without a scroll', () => {
        const hook = setup();

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 2000, contentHeight: 4000, viewportHeight: SCREEN })));

        // Re-measuring can briefly report a shorter content height. The clamp is
        // local to the decision, so the stored offset survives the dip.
        act(() => hook.result.onContentSizeChange(400, 1000));
        expect(hook.result.showScrollToTop).toBe(false);

        act(() => hook.result.onContentSizeChange(400, 4000));
        expect(hook.result.showScrollToTop).toBe(true);
        expect(hook.result.showScrollToBottom).toBe(true);
    });

    it('holds the decision when the viewport re-lays out unchanged', () => {
        const hook = setup();

        act(() => hook.result.onScroll(scrollEvent({ offsetY: 0, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(hook.result.showScrollToBottom).toBe(true);

        // Rotation, banner show/hide and keyboard events re-layout the viewport;
        // a repeat of the same height must not disturb the content geometry.
        act(() => hook.result.onViewportLayout(layoutEvent(SCREEN)));

        expect(hook.result.showScrollToBottom).toBe(true);
    });
});

describe('useScrollAffordance handler identity', () => {
    it('keeps the event handlers stable across a decision flip', () => {
        const hook = setup();
        const first = {
            onScroll: hook.result.onScroll,
            onContentSizeChange: hook.result.onContentSizeChange,
            onViewportLayout: hook.result.onViewportLayout,
        };

        // Screens are memoised on their props; a new handler per render would
        // defeat that on every scroll tick, so they must survive a state change.
        act(() => hook.result.onScroll(scrollEvent({ offsetY: 400, contentHeight: 4000, viewportHeight: SCREEN })));

        expect(hook.result.showScrollToTop).toBe(true);
        expect(hook.result.onScroll).toBe(first.onScroll);
        expect(hook.result.onContentSizeChange).toBe(first.onContentSizeChange);
        expect(hook.result.onViewportLayout).toBe(first.onViewportLayout);
    });
});

describe('resolveOverlayDockBottom', () => {
    const dock: OverlayDock = { bottom: 92, height: 68 };

    it('leaves the base offset alone when no dock is published', () => {
        expect(resolveOverlayDockBottom(null, 0, 16)).toBe(16);
        expect(resolveOverlayDockBottom(null, 58, 16)).toBe(16);
    });

    it('lifts the rail above the dock', () => {
        // Top edge in window space is 92 + 68 = 160; plus the 8px gap.
        expect(resolveOverlayDockBottom(dock, 0, 16)).toBe(168);
    });

    it('subtracts the tab bar, because the dock is measured in window space', () => {
        // The screen ends 58px above the window bottom, so only the part of the
        // dock inside the screen needs clearing.
        expect(resolveOverlayDockBottom(dock, 58, 16)).toBe(110);
    });

    it('never pushes the rail above the screen padding it already clears', () => {
        expect(resolveOverlayDockBottom(dock, 500, 16)).toBe(16);
    });
});

describe('rail placement', () => {
    // Typical Pixel-class device.
    const WINDOW_HEIGHT = 800;
    const SAFE_BOTTOM = 24;
    const TAB_BAR_BASE = 58;
    const chrome = TAB_BAR_BASE + SAFE_BOTTOM; // TabNavigator height
    const fabDock: OverlayDock = { bottom: 92, height: 68 };

    it('sits above the operation button when both are visible', () => {
        // Without a dock the rail clears the tab bar and the safe area only.
        expect(resolveOverlayDockBottom(null, chrome, 16)).toBe(16);

        // With the button on screen the rail moves above it. The button's top
        // edge sits 160 above the window bottom, which is 78 above this screen
        // (the tab bar takes the other 82); plus an 8px gap.
        const bottom = resolveOverlayDockBottom(fabDock, chrome, 16);
        expect(bottom).toBe(86);

        // The rail's own height is 98 (two 44px slots + 10 gap). Inside the
        // screen (which ends `chrome` above the window bottom), the rail's
        // bottom edge lands 8px above the button's top edge.
        const screenBottom = WINDOW_HEIGHT - chrome;
        const railBottomEdge = screenBottom - bottom;
        const railTopEdge = railBottomEdge - 98;
        const fabTopEdge = WINDOW_HEIGHT - fabDock.bottom - fabDock.height;

        expect(fabTopEdge - railBottomEdge).toBe(8);
        expect(railTopEdge).toBeLessThan(fabTopEdge);
    });

    it('does not cover the tab bar when no dock is present', () => {
        // The screen ends above the tab bar, so the base 16px offset already
        // clears it; resolving must never push the rail into the bar.
        const bottom = resolveOverlayDockBottom(null, chrome, 16);
        expect(bottom).toBeGreaterThanOrEqual(16);
        expect(bottom).toBeLessThan(chrome);
    });
});

describe('rail content reservation', () => {
    it('reserves the rail height above the base offset when nothing is docked', () => {
        const base = 16;
        // 2 slots (88) + gap (10) + base offset (16)
        expect(resolveOverlayDockBottom(null, 0, base) + 98).toBe(114);
    });

    it('reserves more when the operation button lifts the rail', () => {
        const dock: OverlayDock = { bottom: 92, height: 68 };
        const chrome = 82;
        const bottom = resolveOverlayDockBottom(dock, chrome, 16);
        const inset = bottom + 98;

        // The reservation must cover the lifted rail, not just the base one.
        expect(inset).toBeGreaterThan(114);
        expect(inset).toBe(bottom + 98);
    });
});
