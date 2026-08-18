import { resolvePassphraseBannerPlacement } from '../../domain/passphraseBannerPlacement';
import type { PassphraseBannerPlacement } from '../../domain/passphraseBannerPlacement';
import {
    BANNER_GAP,
    BANNER_SCREEN_MARGIN,
    BANNER_VIEWPORT_CLEARANCE,
    COMPACT_BANNER_HEIGHT,
    GENERATOR_BANNER_HEIGHT,
    POINTER_SIZE,
} from './constants';
import type { BannerLayout, PassphraseBannerMode } from './types';

const getFallbackKeyboardHeight = (windowHeight: number): number => (
    Math.max(320, Math.round(windowHeight * 0.42))
);

const clamp = (value: number, min: number, max: number): number => (
    Math.max(min, Math.min(value, max))
);

export const emptyLayout: BannerLayout = {
    left: BANNER_SCREEN_MARGIN,
    placement: 'below',
    pointerLeft: 0,
    top: 0,
    width: 0,
};

export type ComputeBannerLayoutParams = {
    anchorHeight: number;
    anchorWidth: number;
    anchorWindowX: number;
    anchorWindowY: number;
    /** Measured banner height; 0 falls back to the per-mode estimate. */
    bannerHeight: number;
    bannerMode: PassphraseBannerMode;
    currentPlacement?: PassphraseBannerPlacement;
    insetsBottom: number;
    insetsTop: number;
    keyboardFallbackEnabled?: boolean;
    keyboardMetricsScreenY?: number;
    keyboardTop: number | null;
    platformIsAndroid: boolean;
    rootHeight: number;
    rootWidth: number;
    rootX: number;
    rootY: number;
    windowHeight: number;
};

/**
 * Pure layout computation for the passphrase banner — extracted verbatim from
 * the measurement callback inside PassphraseBannerOverlay (APP-ARCH-002).
 * Placement decisions delegate to the domain resolver (passphraseBannerPlacement);
 * this function owns only the geometry (widths, margins, clamps) around it.
 */
export const computeBannerLayout = ({
    anchorHeight,
    anchorWidth,
    anchorWindowX,
    anchorWindowY,
    bannerHeight,
    bannerMode,
    currentPlacement,
    insetsBottom,
    insetsTop,
    keyboardFallbackEnabled = false,
    keyboardMetricsScreenY,
    keyboardTop,
    platformIsAndroid,
    rootHeight,
    rootWidth,
    rootX,
    rootY,
    windowHeight,
}: ComputeBannerLayoutParams): BannerLayout => {
    const fallbackKeyboardHeight = getFallbackKeyboardHeight(windowHeight);
    const viewportBottom = rootY + rootHeight;
    const viewportUsesFullWindow = rootHeight >= windowHeight - BANNER_SCREEN_MARGIN * 2;
    const fallbackKeyboardTop = viewportUsesFullWindow
        ? windowHeight - fallbackKeyboardHeight
        : viewportBottom;
    const estimatedHeight = bannerMode === 'generate'
        ? GENERATOR_BANNER_HEIGHT
        : COMPACT_BANNER_HEIGHT;
    const resolvedBannerHeight = bannerHeight || estimatedHeight;
    const visibleTop = Math.max(
        BANNER_SCREEN_MARGIN,
        insetsTop - rootY + BANNER_SCREEN_MARGIN,
    );
    const visibleBottom = Math.min(
        keyboardTop
            ?? keyboardMetricsScreenY
            ?? (
                platformIsAndroid && keyboardFallbackEnabled
                    ? fallbackKeyboardTop
                    : viewportBottom
            ),
        viewportBottom - insetsBottom,
    ) - rootY - BANNER_SCREEN_MARGIN;
    const x = anchorWindowX - rootX;
    const y = anchorWindowY - rootY;
    const inputTop = y;
    const inputBottom = y + anchorHeight;
    const placement = resolvePassphraseBannerPlacement({
        bannerHeight: resolvedBannerHeight,
        currentPlacement,
        gap: BANNER_GAP,
        inputBottom,
        inputTop,
        viewportClearance: BANNER_VIEWPORT_CLEARANCE,
        visibleBottom,
        visibleTop,
    });
    const bannerWidth = Math.max(0, Math.min(anchorWidth, rootWidth - BANNER_SCREEN_MARGIN * 2));
    const left = clamp(
        x,
        BANNER_SCREEN_MARGIN,
        Math.max(BANNER_SCREEN_MARGIN, rootWidth - bannerWidth - BANNER_SCREEN_MARGIN),
    );
    const candidateTop = placement === 'above'
        ? inputTop - BANNER_GAP - resolvedBannerHeight
        : inputBottom + BANNER_GAP;
    const top = clamp(
        candidateTop,
        visibleTop,
        Math.max(visibleTop, visibleBottom - resolvedBannerHeight),
    );
    const anchorCenterX = x + anchorWidth / 2;
    const pointerLeft = clamp(
        anchorCenterX - left - POINTER_SIZE / 2,
        POINTER_SIZE,
        Math.max(POINTER_SIZE, bannerWidth - POINTER_SIZE * 2),
    );

    return {
        left,
        placement,
        pointerLeft,
        top,
        width: bannerWidth,
    };
};
