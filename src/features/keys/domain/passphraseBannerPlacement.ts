export type PassphraseBannerPlacement = 'above' | 'below';

type ShouldMeasurePassphraseBannerParams = {
    isClosing: boolean;
    isVisible: boolean;
};

type ResolvePassphraseBannerPlacementParams = {
    bannerHeight: number;
    currentPlacement?: PassphraseBannerPlacement;
    gap: number;
    inputBottom: number;
    inputTop: number;
    viewportClearance?: number;
    visibleBottom: number;
    visibleTop: number;
};

export const shouldMeasurePassphraseBanner = ({
    isClosing,
    isVisible,
}: ShouldMeasurePassphraseBannerParams): boolean => isVisible && !isClosing;

export const resolvePassphraseBannerPlacement = ({
    bannerHeight,
    currentPlacement,
    gap,
    inputBottom,
    inputTop,
    viewportClearance = 0,
    visibleBottom,
    visibleTop,
}: ResolvePassphraseBannerPlacementParams): PassphraseBannerPlacement => {
    const spaceBelow = Math.max(0, visibleBottom - inputBottom - gap);
    const spaceAbove = Math.max(0, inputTop - visibleTop - gap);
    const requiredSpace = bannerHeight + viewportClearance;
    const fitsBelow = spaceBelow >= requiredSpace;
    const fitsAbove = spaceAbove >= requiredSpace;

    if (currentPlacement === 'above' && fitsAbove) {
        return 'above';
    }
    if (currentPlacement === 'below' && fitsBelow) {
        return 'below';
    }

    if (fitsBelow) {
        return 'below';
    }
    if (fitsAbove) {
        return 'above';
    }

    return spaceAbove > spaceBelow ? 'above' : 'below';
};
