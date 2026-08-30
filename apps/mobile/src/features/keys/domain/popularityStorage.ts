import { popularityStore } from '../../../utils/stores/popularityStore';
import { KeyPair } from '../../../types/types';
import { getDisplayName } from './displayNameUtils';

/**
 * Increment popularity count for a specific key.
 * If the key does not exist, initialize it to 1.
 */
export async function incrementPopularity(userId: string, keyId: string): Promise<void> {
    await popularityStore.update(index => ({
        ...index,
        [userId]: {
            ...index[userId],
            [keyId]: (index[userId]?.[keyId] ?? 0) + 1,
        },
    }));
}

/**
 * Get all popularity entries for a user as a map from keyId to count.
 */
export async function getAllPopularities(userId: string): Promise<Record<string, number>> {
    const index = await popularityStore.read();
    return index[userId] ?? {};
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
