import type { SharePayload } from 'expo-sharing';

export type ShareIntentPayload = {
    text?: string | null;
    mimeType?: string | null;
    shareType?: SharePayload['shareType'];
};

export const normalizeSharePayloads = (payloads: SharePayload[]): ShareIntentPayload => {
    const payload = payloads.find(nextPayload => (
        (nextPayload.shareType === 'text' || nextPayload.shareType === 'url') &&
        nextPayload.value.trim() !== ''
    ));

    if (!payload) {
        return {};
    }

    return {
        text: payload.value,
        mimeType: payload.mimeType,
        shareType: payload.shareType,
    };
};
