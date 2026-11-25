import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

vi.mock('react-native', () => ({
    ScrollView: 'ScrollView',
    View: 'View',
    Keyboard: { metrics: () => null, addListener: () => ({ remove() {} }), dismiss() {} },
    Dimensions: { get: () => ({ width: 400, height: 800 }) },
    Platform: { OS: 'android' },
    StyleSheet: { create: (s: Record<string, unknown>) => s, flatten: (s: unknown) => s },
    Animated: { Value: class { setValue(){} }, timing: () => ({ start(){} }), View: 'Animated.View' },
    Pressable: 'Pressable',
}));
vi.mock('@expo/vector-icons/MaterialIcons', () => ({ default: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top:0,bottom:0,left:0,right:0 }) }));
vi.mock('../styles/theme', () => ({ theme: { colors: {}, spacing: { md: 16, lg: 24, xxl: 48 }, borderRadius: { md: 14 } } }));
vi.mock('../styles/commonStyles', () => ({ commonStyles: { container: {}, flex: {}, p: {} } }));
vi.mock('./KeyboardAwareScrollContext', () => ({ KeyboardAwareScrollContext: { Provider: ({children}: any) => children } }));

// Track what the scroll engine and the screen each receive.
const observed: Record<string, string[]> = { engine: [], affordance: [], screen: [] };
vi.mock('./useScreenScrollEngine', () => ({
    useScreenScrollEngine: ({ onScroll, onContentSizeChange, onLayout }: any) => ({
        attachRef: () => {},
        keyboardBottomSpacer: 0,
        contextValue: {},
        scrollProps: {
            onScroll: (e: any) => { observed.engine.push('scroll'); onScroll?.(e); },
            onContentSizeChange: (w: number, h: number) => { observed.engine.push(`contentSize:${h}`); onContentSizeChange?.(w, h); },
            onLayout: (e: any) => { observed.engine.push('layout'); onLayout?.(e); },
            onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {},
        },
    }),
}));

import { ScreenContainer } from './ScreenContainer';
import { useScrollAffordance } from './ScrollAffordance';
import {
    OverlayDockContext,
    OverlayDockIsolation,
    OverlayDockProvider,
    useOverlayDockPublisher,
    type OverlayDock,
} from './overlayDock';

/** Reads the raw context so isolation is observable directly. */
const useOverlayDockClearanceProbe = (): OverlayDock | null => {
    const value = React.useContext(OverlayDockContext);
    return value?.dock ?? null;
};

/** Publishes a dock while mounted. */
const PublishDock = ({ dock }: { dock: OverlayDock }) => {
    const publish = useOverlayDockPublisher();
    React.useEffect(() => {
        publish?.(dock);
        return () => publish?.(null);
    }, [publish, dock]);
    return null;
};

const findScrollView = (tree: any): any => {
    if (tree.type === 'ScrollView') return tree;
    for (const child of tree.children ?? []) {
        const found = findScrollView(child);
        if (found) return found;
    }
    return null;
};

describe('ScreenContainer scroll wiring', () => {
    it('keeps the screen handler and the engine handler both attached', () => {
        const screenOnScroll = vi.fn();
        let renderer: any;
        act(() => {
            renderer = create(
                <ScreenContainer onScroll={screenOnScroll}>
                    <></>
                </ScreenContainer>,
            );
        });

        const scrollView = findScrollView(renderer.toJSON());
        expect(scrollView).not.toBeNull();

        act(() => {
            scrollView.props.onScroll({
                nativeEvent: {
                    contentOffset: { x: 0, y: 400 },
                    contentSize: { width: 400, height: 4000 },
                    layoutMeasurement: { width: 400, height: 800 },
                },
            });
        });

        // Both the engine and the screen handler saw it.
        expect(observed.engine).toContain('scroll');
        expect(screenOnScroll).toHaveBeenCalledTimes(1);
    });

    it('feeds content size to the engine and the affordance hook', () => {
        observed.engine.length = 0;
        let renderer: any;
        act(() => {
            renderer = create(<ScreenContainer><></></ScreenContainer>);
        });
        const scrollView = findScrollView(renderer.toJSON());

        act(() => { scrollView.props.onContentSizeChange(400, 5000); });

        // Engine recorded it once; the affordance hook does not record but must
        // not swallow the engine's call (compose, not override).
        expect(observed.engine).toEqual(['contentSize:5000']);
    });
});

describe('load more / growth without scrolling', () => {
    it('surfaces the bottom button when content grows after the viewport laid out', () => {
        const latest: { current: any } = { current: null };
        function Probe() { latest.current = useScrollAffordance(); return null; }
        let renderer: any;
        act(() => { renderer = create(<Probe />); });

        // Screen measured, first page is short: nothing to offer.
        act(() => latest.current.onViewportLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } },
        }));
        act(() => latest.current.onContentSizeChange(400, 900));
        expect(latest.current.showScrollToBottom).toBe(false);

        // "Load more" appends rows: content size jumps, no finger moved.
        act(() => latest.current.onContentSizeChange(400, 4000));

        // The regression Pawify fixed: the bottom button must appear right away,
        // not one scroll event later.
        expect(latest.current.showScrollToBottom).toBe(true);
    });
});

describe('OverlayDockIsolation', () => {
    it('hides any published dock from its subtree', () => {
        // Latest value each probe rendered with, keyed by position.
        const unshielded: Array<OverlayDock | null> = [];
        const shielded: Array<OverlayDock | null> = [];

        const UnshieldedProbe = () => {
            unshielded.push(useOverlayDockClearanceProbe());
            return null;
        };
        const ShieldedProbe = () => {
            shielded.push(useOverlayDockClearanceProbe());
            return null;
        };

        const tree = (
            <OverlayDockProvider>
                <PublishDock dock={{ bottom: 92, height: 68 }} />
                <UnshieldedProbe />
                <OverlayDockIsolation>
                    <ShieldedProbe />
                </OverlayDockIsolation>
            </OverlayDockProvider>
        );

        let renderer: any;
        act(() => { renderer = create(tree); });
        // The publisher's effect commits, then the provider re-renders.
        act(() => { renderer.update(tree); });

        // Both probes render inside the provider; only the shielded one sees null.
        expect(unshielded.at(-1)).not.toBeNull();
        expect(shielded.at(-1)).toBeNull();
    });
});
