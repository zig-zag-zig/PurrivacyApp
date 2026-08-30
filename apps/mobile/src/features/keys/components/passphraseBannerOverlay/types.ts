import type { PassphraseBannerPlacement } from '../../domain/passphraseBannerPlacement';

export type PassphraseBannerMode = 'stored' | 'generate';

export type PassphraseBannerAnchor = {
    measureInWindow: (
        callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
};

export type PassphraseBannerRequest = {
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

export type PassphraseBannerOverlayContextValue = {
    hidePassphraseBanner: (id?: string) => void;
    showPassphraseBanner: (request: PassphraseBannerRequest) => void;
};

export type BannerLayout = {
    left: number;
    placement: PassphraseBannerPlacement;
    pointerLeft: number;
    top: number;
    width: number;
};
