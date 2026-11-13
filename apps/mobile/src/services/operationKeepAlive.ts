/**
 * Best-effort native background keep-alive for active OperationCenter jobs.
 *
 * Android uses a foreground service with an ongoing low-importance progress
 * notification so the OS treats user-started crypto/key work as active while
 * the user switches apps briefly. iOS uses `beginBackgroundTask` in the
 * AppDelegate when backgrounding, and this module remains a safe no-op when no
 * native module is registered (unit tests, iOS JS side, older dev clients).
 */

const MODULE_NAME = 'PurrivacyOperationKeepAlive';

interface OperationKeepAliveNative {
    startKeepAlive: (title: string, detail: string) => Promise<boolean>;
    updateKeepAlive: (title: string, detail: string) => Promise<boolean>;
    stopKeepAlive: () => Promise<boolean>;
}

const getNative = (): OperationKeepAliveNative | null => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const rn = require('react-native') as typeof import('react-native');
        if (rn.Platform?.OS !== 'android') return null;
        return (rn.NativeModules?.[MODULE_NAME] as OperationKeepAliveNative | undefined) ?? null;
    } catch {
        return null;
    }
};

export const startOperationKeepAlive = async (title: string, detail = ''): Promise<boolean> => {
    const native = getNative();
    if (!native) return false;
    try {
        return await native.startKeepAlive(title, detail);
    } catch {
        return false;
    }
};

export const updateOperationKeepAlive = async (title: string, detail = ''): Promise<boolean> => {
    const native = getNative();
    if (!native) return false;
    try {
        return await native.updateKeepAlive(title, detail);
    } catch {
        return false;
    }
};

export const stopOperationKeepAlive = async (): Promise<boolean> => {
    const native = getNative();
    if (!native) return false;
    try {
        return await native.stopKeepAlive();
    } catch {
        return false;
    }
};
