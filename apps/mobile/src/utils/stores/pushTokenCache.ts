import { createFileStore, TypedStore } from './fileStore';

/**
 * Cache of the Expo push token registered for the signed-in user.
 *
 * This store persists to a PLAINTEXT cache file. The value class must never
 * contain secrets — a push token is non-sensitive routing metadata, but
 * passphrases, private keys, mnemonics, and DEKs belong in SecureStore or an
 * encrypted store. A runtime guard rejects secret-classified property names
 * on write.
 */
type PushTokenCacheValue = string | null;

function isPushTokenCacheValue(value: unknown): value is PushTokenCacheValue {
    return value === null || typeof value === 'string';
}

/**
 * The legacy generic storage helper kept the token under the flat
 * `expoPushToken` key in the shared app-cache.json.
 */
function migrateLegacy(legacy: Record<string, unknown>): PushTokenCacheValue | undefined {
    const token = legacy.expoPushToken;
    return typeof token === 'string' && token.length > 0 ? token : undefined;
}

export const pushTokenCache: TypedStore<PushTokenCacheValue> = createFileStore<PushTokenCacheValue>({
    fileName: 'push-token-cache.json',
    defaultValue: null,
    isValid: isPushTokenCacheValue,
    migrateLegacy,
});

export async function getPushToken(): Promise<string | null> {
    return pushTokenCache.read();
}

export async function setPushToken(token: string): Promise<void> {
    await pushTokenCache.write(token);
}
