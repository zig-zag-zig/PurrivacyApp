import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { SharePayload } from 'expo-sharing';

import { normalizeSharePayloads } from '../services/sharePayloadNormalization';

const canReceiveShares = Platform.OS === 'android' || Platform.OS === 'ios';

const getIncomingSharePayloads = (): SharePayload[] => {
    if (!canReceiveShares) {
        return [];
    }

    return Sharing.getSharedPayloads();
};

const isExpoSharingUrl = (url: string): boolean => {
    try {
        return new URL(url).hostname === 'expo-sharing';
    } catch {
        return false;
    }
};

export function useShareIntent() {
    const [sharePayloads, setSharePayloads] = useState<SharePayload[]>([]);
    const [error, setError] = useState<Error | null>(null);

    const refreshSharePayloads = useCallback(() => {
        try {
            setSharePayloads(getIncomingSharePayloads());
            setError(null);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error('Could not open shared content'));
        }
    }, []);

    const resetShareIntent = useCallback(() => {
        try {
            if (canReceiveShares) {
                Sharing.clearSharedPayloads();
            }
            setSharePayloads([]);
            setError(null);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error('Could not clear shared content'));
        }
    }, []);

    useEffect(() => {
        refreshSharePayloads();

        const appStateSubscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                refreshSharePayloads();
            }
        });
        const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            if (isExpoSharingUrl(url)) {
                refreshSharePayloads();
            }
        });

        return () => {
            appStateSubscription.remove();
            linkingSubscription.remove();
        };
    }, [refreshSharePayloads]);

    const shareIntent = useMemo(() => normalizeSharePayloads(sharePayloads), [sharePayloads]);

    return {
        hasShareIntent: Boolean(shareIntent.text?.trim()),
        shareIntent,
        resetShareIntent,
        error,
    };
}
