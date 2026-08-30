type BannerDismissListener = () => void;
type BannerRepositionListener = () => void;

const listeners = new Set<BannerDismissListener>();
const repositionListeners = new Set<BannerRepositionListener>();
let suppressDismissUntil = 0;
const DISMISS_FOCUS_SETTLE_MS = 40;

export const subscribePassphraseBannerDismiss = (
    listener: BannerDismissListener,
): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const suppressNextPassphraseBannerDismiss = (): void => {
    suppressDismissUntil = Date.now() + 800;
};

export const subscribePassphraseBannerReposition = (
    listener: BannerRepositionListener,
): (() => void) => {
    repositionListeners.add(listener);
    return () => repositionListeners.delete(listener);
};

export const requestPassphraseBannerReposition = (): void => {
    repositionListeners.forEach(listener => listener());
};

export const requestPassphraseBannerDismiss = (): void => {
    setTimeout(() => {
        if (Date.now() < suppressDismissUntil) return;
        listeners.forEach(listener => listener());
    }, DISMISS_FOCUS_SETTLE_MS);
};

export const resetForTesting = (): void => {
    listeners.clear();
    repositionListeners.clear();
    suppressDismissUntil = 0;
};
