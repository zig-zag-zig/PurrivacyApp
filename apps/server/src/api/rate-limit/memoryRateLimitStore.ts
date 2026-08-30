import { RateLimitCounterResult, RateLimitStore } from './rateLimitStoreTypes';

const DEFAULT_MAX_KEYS = 50_000;
const CLEANUP_INTERVAL_MS = 60_000;

interface MemoryEntry {
    count: number;
    resetTime: number;
}

/**
 * Process-local fixed-window rate limit store.
 *
 * Memory is bounded: expired entries are purged opportunistically and, when
 * the store is full, the entry expiring soonest is evicted to make room for
 * new keys. This prevents high-cardinality traffic from growing the map
 * without bound (API-SEC-001).
 */
export class MemoryRateLimitStore implements RateLimitStore {
    readonly kind = 'memory' as const;

    private readonly entries = new Map<string, MemoryEntry>();
    private readonly maxKeys: number;
    private lastCleanup = 0;

    constructor(maxKeys: number = DEFAULT_MAX_KEYS) {
        this.maxKeys = maxKeys;
    }

    async increment(key: string, windowMs: number): Promise<RateLimitCounterResult> {
        const now = Date.now();
        this.maybeCleanup(now);

        const existing = this.entries.get(key);
        if (existing && existing.resetTime > now) {
            existing.count += 1;
            return { count: existing.count, resetTime: existing.resetTime };
        }

        if (!existing) {
            this.evictIfFull(now);
        }

        const entry: MemoryEntry = { count: 1, resetTime: now + windowMs };
        this.entries.set(key, entry);
        return { count: entry.count, resetTime: entry.resetTime };
    }

    async decrement(key: string, _windowMs: number): Promise<void> {
        const entry = this.entries.get(key);
        if (entry && entry.count > 0) {
            entry.count -= 1;
        }
    }

    /** Test helper: current number of tracked keys. */
    get size(): number {
        return this.entries.size;
    }

    private maybeCleanup(now: number): void {
        if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) {
            return;
        }
        this.lastCleanup = now;
        for (const [key, entry] of this.entries) {
            if (entry.resetTime <= now) {
                this.entries.delete(key);
            }
        }
    }

    private evictIfFull(now: number): void {
        if (this.entries.size < this.maxKeys) {
            return;
        }

        for (const [key, entry] of this.entries) {
            if (entry.resetTime <= now) {
                this.entries.delete(key);
            }
        }

        if (this.entries.size < this.maxKeys) {
            return;
        }

        let soonestKey: string | null = null;
        let soonestReset = Number.POSITIVE_INFINITY;
        for (const [key, entry] of this.entries) {
            if (entry.resetTime < soonestReset) {
                soonestReset = entry.resetTime;
                soonestKey = key;
            }
        }
        if (soonestKey !== null) {
            this.entries.delete(soonestKey);
        }
    }
}
