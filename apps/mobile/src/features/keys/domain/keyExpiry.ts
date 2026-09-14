import type { KeyPair } from '../../../types/types';

/**
 * The key record stores `expiry` as a pre-formatted display string produced by
 * the hidden PGP WebView (`formatExpiry`), not a raw timestamp:
 *   - "Never expires"
 *   - "24.09.2026 (expires in 365 days)"
 *   - "24.09.2024 (expired 5 days ago)"
 *
 * This module parses that format back into a structured status so list filters
 * and the expiry dashboard can classify keys without a WebView round-trip. The
 * format is ours and stable; parsing is defensive — anything unrecognised
 * yields `unknown` and is treated as "not expiring" rather than crashing.
 */

export type KeyExpiryStatus =
    | { kind: 'never' }
    | { kind: 'expired'; daysAgo: number }
    | { kind: 'expiring'; daysLeft: number }
    | { kind: 'unknown' };

const EXPIRES_IN_RE = /expires in (\d+) day/i;
const EXPIRED_AGO_RE = /expired (\d+) day/i;

/** Default window for "expiring soon": keys expiring within this many days. */
export const EXPIRING_SOON_DAYS = 30;

export function parseKeyExpiry(expiry: string | null | undefined): KeyExpiryStatus {
    const text = (expiry ?? '').trim();
    if (!text) return { kind: 'unknown' };
    if (/never expires/i.test(text)) return { kind: 'never' };

    const expiredMatch = text.match(EXPIRED_AGO_RE);
    if (expiredMatch) {
        return { kind: 'expired', daysAgo: Number(expiredMatch[1]) };
    }

    const expiringMatch = text.match(EXPIRES_IN_RE);
    if (expiringMatch) {
        return { kind: 'expiring', daysLeft: Number(expiringMatch[1]) };
    }

    return { kind: 'unknown' };
}

/** True when the key has a finite expiry and it is within `withinDays` (or already past). */
export function isKeyExpiringSoon(
    key: Pick<KeyPair, 'expiry'>,
    withinDays: number = EXPIRING_SOON_DAYS,
): boolean {
    const status = parseKeyExpiry(key.expiry);
    if (status.kind === 'expired') return true;
    if (status.kind === 'expiring') return status.daysLeft <= withinDays;
    return false;
}

/** True when the key has already expired. */
export function isKeyExpired(key: Pick<KeyPair, 'expiry'>): boolean {
    return parseKeyExpiry(key.expiry).kind === 'expired';
}
