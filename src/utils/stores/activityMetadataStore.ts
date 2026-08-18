import { createFileStore, TypedStore } from './fileStore';

/**
 * Last-activity metadata for the inactivity lock, keyed by user id
 * (value: epoch milliseconds of the last app activity).
 *
 * This store persists to a PLAINTEXT cache file. The value class must never
 * contain secrets (passphrases, private keys, mnemonics, DEKs, tokens) —
 * secrets belong in SecureStore or an encrypted store. A runtime guard
 * rejects secret-classified property names on write.
 */
type ActivityMetadata = Record<string, number>;

function isActivityMetadata(value: unknown): value is ActivityMetadata {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).every(
        item => typeof item === 'number' && Number.isFinite(item),
    );
}

/**
 * Legacy layout stored timestamps under flat `last_active_time<userId>` keys
 * in the shared app-cache.json. Rebuilds the per-user map from those keys.
 */
function migrateLegacy(legacy: Record<string, unknown>): ActivityMetadata | undefined {
    const PREFIX = 'last_active_time';
    const result: ActivityMetadata = {};
    for (const [key, value] of Object.entries(legacy)) {
        if (!key.startsWith(PREFIX)) continue;
        const userId = key.slice(PREFIX.length);
        const timestamp = Number(value);
        if (userId && Number.isFinite(timestamp)) {
            result[userId] = timestamp;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

export const activityMetadataStore: TypedStore<ActivityMetadata> = createFileStore<ActivityMetadata>({
    fileName: 'activity-metadata.json',
    defaultValue: {},
    isValid: isActivityMetadata,
    migrateLegacy,
});

export async function getLastActiveTime(userId: string): Promise<number | null> {
    const metadata = await activityMetadataStore.read();
    const value = metadata[userId];
    return typeof value === 'number' ? value : null;
}

export async function setLastActiveTime(userId: string, timestamp: number): Promise<void> {
    await activityMetadataStore.update(metadata => ({ ...metadata, [userId]: timestamp }));
}

export async function clearLastActiveTime(userId: string): Promise<void> {
    await activityMetadataStore.update(metadata => {
        const { [userId]: _removed, ...rest } = metadata;
        return rest;
    });
}
