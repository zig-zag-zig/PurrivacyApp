import { describe, expect, it } from 'vitest';

import { computeBannerLayout, emptyLayout } from './bannerLayout';
import type { ComputeBannerLayoutParams } from './bannerLayout';

// Full-window viewport (rootHeight >= windowHeight - 2 * BANNER_SCREEN_MARGIN),
// stored banner (48px estimated), no keyboard, no insets.
const baseParams: ComputeBannerLayoutParams = {
    anchorHeight: 40,
    anchorWidth: 200,
    anchorWindowX: 100,
    anchorWindowY: 300,
    bannerHeight: 0,
    bannerMode: 'stored',
    insetsBottom: 0,
    insetsTop: 0,
    keyboardFallbackEnabled: false,
    keyboardMetricsScreenY: undefined,
    keyboardTop: null,
    platformIsAndroid: false,
    rootHeight: 800,
    rootWidth: 400,
    rootX: 0,
    rootY: 0,
    windowHeight: 800,
};

describe('computeBannerLayout', () => {
    it('places the banner below the field when there is room', () => {
        const layout = computeBannerLayout(baseParams);

        expect(layout).toEqual({
            left: 100,
            placement: 'below',
            pointerLeft: 93,
            top: 354,
            width: 200,
        });
    });

    it('places the banner above when the keyboard leaves no room below (android fallback)', () => {
        // Fallback keyboard top: 800 - max(320, round(800 * 0.42)) = 464.
        // visibleBottom = 464 - 8 = 456; input 420..460 leaves -18 below.
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 420,
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
        });

        expect(layout.placement).toBe('above');
        expect(layout.top).toBe(358); // 420 - 14 - 48
    });

    it('keeps the current above placement while the full banner still fits above', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            currentPlacement: 'above',
        });

        expect(layout.placement).toBe('above');
        expect(layout.top).toBe(238); // 300 - 14 - 48
    });

    it('prefers an explicit keyboardTop over the android fallback', () => {
        // With the fallback (464) the space below 420 is 456-420-14 = 22 (< 80);
        // with keyboardTop 520 the space below is 512-420-14 = 78 (< 80)…
        const withFallback = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 420,
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
        });
        // …but with the keyboard at 580 the banner fits below again.
        const withKeyboardTop = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 420,
            keyboardFallbackEnabled: true,
            keyboardTop: 580,
            platformIsAndroid: true,
        });

        expect(withFallback.placement).toBe('above');
        expect(withKeyboardTop.placement).toBe('below');
        expect(withKeyboardTop.top).toBe(474); // 460 + 14
    });

    it('uses keyboard metrics screenY when no keyboardTop event is available', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 340,
            keyboardFallbackEnabled: true,
            keyboardMetricsScreenY: 500,
            platformIsAndroid: true,
        });

        // Fallback would cap at 456 (space below 62 < 80 → above); the metrics
        // value caps at 492 (space below 98 ≥ 80 → below).
        expect(layout.placement).toBe('below');
    });

    it('clamps the banner left edge into the viewport margins', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowX: 2,
        });

        expect(layout.left).toBe(8);
    });

    it('clamps the pointer into the banner width on the right edge', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowX: 390,
        });

        expect(layout.left).toBe(192);
        expect(layout.pointerLeft).toBe(172); // 200 - 2 * 14
    });

    it('clamps the top to the visible top when neither side can fit the banner', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 300,
            bannerHeight: 400,
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
        });

        // 400px banner: 102 below and 278 above, both < 432 → above wins on
        // space, then the top clamps up to the visible top (8).
        expect(layout.placement).toBe('above');
        expect(layout.top).toBe(8);
    });

    it('uses the generate-mode height estimate (64) for placement', () => {
        const stored = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 420,
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
        });
        const generated = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 420,
            bannerMode: 'generate',
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
        });

        expect(stored.placement).toBe('above');
        expect(stored.top).toBe(358);
        expect(generated.placement).toBe('above');
        expect(generated.top).toBe(342); // 420 - 14 - 64
    });

    it('lets a measured banner height override the estimate', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 420,
            bannerHeight: 100,
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
        });

        expect(layout.placement).toBe('above');
        expect(layout.top).toBe(306); // 420 - 14 - 100
    });

    it('disables the android keyboard fallback for non-full-window viewports', () => {
        const layout = computeBannerLayout({
            ...baseParams,
            anchorWindowY: 300,
            keyboardFallbackEnabled: true,
            platformIsAndroid: true,
            rootHeight: 600,
        });

        // Viewport is not full-window → fallback keyboard top = viewportBottom
        // (600), so the field keeps its below placement.
        expect(layout.placement).toBe('below');
        expect(layout.top).toBe(354);
    });

    it('exposes an empty layout used before the first measurement', () => {
        expect(emptyLayout).toEqual({
            left: 8,
            placement: 'below',
            pointerLeft: 0,
            top: 0,
            width: 0,
        });
    });
});
