import { storage } from '../../../utils/storage';
import { KeyPair } from '../../../types/types';
import { getDisplayName } from './displayNameUtils';

const PREFIX = 'popularity_';

/**
 * Get storage key for a user's key popularity
 */
function getKey(userId: string, keyId: string): string {
    return `${PREFIX}${userId}_${keyId}`;
}

/**
 * Increment popularity count for a specific key.
 * If the key does not exist, initialize it to 1.
 */
export async function incrementPopularity(userId: string, keyId: string): Promise<void> {
    const storageKey = getKey(userId, keyId);
    const current = await storage.getItem(storageKey);
    const count = typeof current === 'number' ? current : 0;
    await storage.setItem(storageKey, count + 1);
}

/**
 * Get all popularity entries for a user as a map from keyId to count.
 * Uses prefix filtering on storage keys.
 */
export async function getAllPopularities(userId: string): Promise<Record<string, number>> {
    const prefix = `${PREFIX}${userId}_`;
    const items = await storage.getItemsByPrefix(prefix);
    const result: Record<string, number> = {};
    for (const key in items) {
        const keyId = key.slice(prefix.length);
        const value = items[key];
        if (typeof value === 'number') {
            result[keyId] = value;
        }
    }
    return result;
}

/**
 * Sort keys by popularity (descending) and then alphabetically by display name.
 * Requires the user's popularity map.
 */
export function sortKeysByPopularity(
    keys: KeyPair[],
    popularityMap: Record<string, number>
): KeyPair[] {
    return [...keys].sort((a, b) => {
        const popA = popularityMap[a.fingerprint] || 0;
        const popB = popularityMap[b.fingerprint] || 0;
        if (popA !== popB) {
            return popB - popA; // descending
        }
        // alphabetical by display name
        return getDisplayName(a.userId).localeCompare(getDisplayName(b.userId));
    });
}

/**
 * Sort keys alphabetically by display name (extracted from userId).
 * @param direction 'asc' for A‑Z, 'desc' for Z‑A (default 'asc')
 */
export function sortKeysAlphabetically(keys: KeyPair[], direction: 'asc' | 'desc' = 'asc'): KeyPair[] {
    const sorted = [...keys].sort((a, b) =>
        getDisplayName(a.userId).localeCompare(getDisplayName(b.userId))
    );
    return direction === 'asc' ? sorted : sorted.reverse();
}
