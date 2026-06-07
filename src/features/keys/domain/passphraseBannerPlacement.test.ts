import { describe, expect, it } from 'vitest';

import {
    resolvePassphraseBannerPlacement,
    shouldMeasurePassphraseBanner,
} from './passphraseBannerPlacement';

const basePlacement = {
    bannerHeight: 64,
    gap: 14,
    inputBottom: 300,
    inputTop: 250,
    visibleBottom: 800,
    visibleTop: 24,
};

describe('resolvePassphraseBannerPlacement', () => {
    it('prefers below whenever the banner fits there', () => {
        expect(resolvePassphraseBannerPlacement(basePlacement)).toBe('below');
    });

    it('places the banner above when the keyboard leaves insufficient room below', () => {
        expect(resolvePassphraseBannerPlacement({
            ...basePlacement,
            visibleBottom: 340,
        })).toBe('above');
    });

    it('returns below when room becomes available there again', () => {
        const constrained = resolvePassphraseBannerPlacement({
            ...basePlacement,
            visibleBottom: 340,
        });
        const restored = resolvePassphraseBannerPlacement(basePlacement);

        expect(constrained).toBe('above');
        expect(restored).toBe('below');
    });

    it('keeps the current above placement while the full banner still fits above', () => {
        expect(resolvePassphraseBannerPlacement({
            ...basePlacement,
            currentPlacement: 'above',
        })).toBe('above');
    });

    it('switches from above to below when above no longer fits', () => {
        expect(resolvePassphraseBannerPlacement({
            ...basePlacement,
            currentPlacement: 'above',
            inputTop: 80,
            inputBottom: 130,
            visibleBottom: 500,
        })).toBe('below');
    });

    it('uses viewport clearance when deciding whether a banner fully fits', () => {
        expect(resolvePassphraseBannerPlacement({
            ...basePlacement,
            inputBottom: 720,
            inputTop: 600,
            visibleBottom: 800,
            viewportClearance: 24,
        })).toBe('above');
    });

    it('keeps the banner below when the field is too close to the top edge', () => {
        expect(resolvePassphraseBannerPlacement({
            ...basePlacement,
            inputTop: 30,
            inputBottom: 80,
        })).toBe('below');
    });

    it('uses the side with more room when neither side can fully contain the banner', () => {
        expect(resolvePassphraseBannerPlacement({
            ...basePlacement,
            inputTop: 80,
            inputBottom: 130,
            visibleTop: 24,
            visibleBottom: 180,
        })).toBe('above');
    });
});

describe('shouldMeasurePassphraseBanner', () => {
    it('only measures the visible active banner', () => {
        expect(shouldMeasurePassphraseBanner({ isClosing: false, isVisible: true })).toBe(true);
        expect(shouldMeasurePassphraseBanner({ isClosing: false, isVisible: false })).toBe(false);
        expect(shouldMeasurePassphraseBanner({ isClosing: true, isVisible: true })).toBe(false);
    });
});
