import type { KeyPair } from '../../../types/types';
import { getDisplayName } from './displayNameUtils';
import { isKeyExpiringSoon } from './keyExpiry';
import { isCompletePair } from './keyUtils';

/**
 * Keys-tab vault filtering. Distinct from the recipient picker's
 * useKeySelectionList (which is selection/popularity-specific); this is a
 * plain search + kind-filter over the key list.
 */

export type VaultKeyFilter = 'all' | 'pairs' | 'public' | 'expiring';

export const VAULT_KEY_FILTERS: Array<{ id: VaultKeyFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'pairs', label: 'Key pairs' },
    { id: 'public', label: 'Public only' },
    { id: 'expiring', label: 'Expiring' },
];

/** Matches the query against display name, raw userId and fingerprint. */
export function keyMatchesQuery(key: KeyPair, rawQuery: string): boolean {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return true;

    const displayName = getDisplayName(key.userId).toLowerCase();
    return (
        key.userId.toLowerCase().includes(query)
        || displayName.includes(query)
        || key.fingerprint.toLowerCase().includes(query)
    );
}

export function keyMatchesFilter(key: KeyPair, filter: VaultKeyFilter): boolean {
    switch (filter) {
        case 'pairs':
            return isCompletePair(key);
        case 'public':
            return !key.privateKey;
        case 'expiring':
            return isKeyExpiringSoon(key);
        case 'all':
        default:
            return true;
    }
}

export function filterVaultKeys(
    keys: KeyPair[],
    query: string,
    filter: VaultKeyFilter,
): KeyPair[] {
    return keys.filter(key => keyMatchesFilter(key, filter) && keyMatchesQuery(key, query));
}
