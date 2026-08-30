import { createFileStore, TypedStore } from './fileStore';

/**
 * Key popularity counters used for key sorting, keyed by user id then key id.
 *
 * This store persists to a PLAINTEXT cache file. The value class must never
 * contain secrets (passphrases, private keys, mnemonics, DEKs, tokens) —
 * secrets belong in SecureStore or an encrypted store. A runtime guard
 * rejects secret-classified property names on write.
 */
type PopularityIndex = Record<string, Record<string, number>>;

function isPopularityIndex(value: unknown): value is PopularityIndex {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).every(entry => (
        !!entry
        && typeof entry === 'object'
        && !Array.isArray(entry)
        && Object.values(entry).every(count => typeof count === 'number' && Number.isFinite(count))
    ));
}

/**
 * Legacy layout stored counters under flat `popularity_<userId>_<keyId>` keys
 * in the shared app-cache.json. Rebuilds the per-user nested map from them.
 */
function migrateLegacy(legacy: Record<string, unknown>): PopularityIndex | undefined {
    const PREFIX = 'popularity_';
    const result: PopularityIndex = {};
    for (const [key, value] of Object.entries(legacy)) {
        if (!key.startsWith(PREFIX) || typeof value !== 'number' || !Number.isFinite(value)) {
            continue;
        }
        const composite = key.slice(PREFIX.length);
        const separator = composite.indexOf('_');
        if (separator <= 0 || separator === composite.length - 1) continue;
        const userId = composite.slice(0, separator);
        const keyId = composite.slice(separator + 1);
        result[userId] = result[userId] ?? {};
        result[userId][keyId] = value;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

export const popularityStore: TypedStore<PopularityIndex> = createFileStore<PopularityIndex>({
    fileName: 'popularity.json',
    defaultValue: {},
    isValid: isPopularityIndex,
    migrateLegacy,
});
