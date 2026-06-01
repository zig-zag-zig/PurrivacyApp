type BannerDismissListener = () => void;

const listeners = new Set<BannerDismissListener>();
let suppressDismissUntil = 0;

export const subscribePassphraseBannerDismiss = (
    listener: BannerDismissListener,
): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const suppressNextPassphraseBannerDismiss = (): void => {
    suppressDismissUntil = Date.now() + 800;
};

export const requestPassphraseBannerDismiss = (): void => {
    setTimeout(() => {
        if (Date.now() < suppressDismissUntil) return;
        listeners.forEach(listener => listener());
    }, 0);
};
