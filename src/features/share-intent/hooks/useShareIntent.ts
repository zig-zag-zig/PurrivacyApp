import { useCallback, useEffect, useMemo, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type ShareIntentPayload = {
    text?: string | null;
    action?: string | null;
    mimeType?: string | null;
};

type NativeShareIntentModule = {
    getInitialShare: () => Promise<ShareIntentPayload | null>;
    clearShare: () => Promise<void>;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
};

const SHARE_INTENT_EVENT = 'PurrivacyShareIntent';

function getNativeShareIntentModule(): NativeShareIntentModule | null {
    if (Platform.OS !== 'android') {
        return null;
    }

    return (NativeModules.PurrivacyShareIntent as NativeShareIntentModule | undefined) ?? null;
}

function normalizeShareIntent(payload: ShareIntentPayload | null): ShareIntentPayload {
    return payload?.text ? { ...payload, text: payload.text } : {};
}

export function useShareIntent() {
    const nativeShareIntentModule = useMemo(getNativeShareIntentModule, []);
    const [shareIntent, setShareIntent] = useState<ShareIntentPayload>({});
    const [error, setError] = useState<Error | null>(null);

    const resetShareIntent = useCallback(() => {
        setShareIntent({});
        void nativeShareIntentModule?.clearShare().catch((nextError: Error) => {
            setError(nextError);
        });
    }, [nativeShareIntentModule]);

    useEffect(() => {
        if (!nativeShareIntentModule) {
            return;
        }

        let isMounted = true;
        void nativeShareIntentModule
            .getInitialShare()
            .then(payload => {
                if (isMounted) {
                    setShareIntent(normalizeShareIntent(payload));
                }
            })
            .catch((nextError: Error) => {
                if (isMounted) {
                    setError(nextError);
                }
            });

        const eventEmitter = new NativeEventEmitter(nativeShareIntentModule);
        const subscription = eventEmitter.addListener(SHARE_INTENT_EVENT, (payload: ShareIntentPayload | null) => {
            setShareIntent(normalizeShareIntent(payload));
        });

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, [nativeShareIntentModule]);

    return {
        hasShareIntent: Boolean(shareIntent.text?.trim()),
        shareIntent,
        resetShareIntent,
        error,
    };
}
