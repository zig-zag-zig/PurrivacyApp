/**
 * Rate limit store contract.
 *
 * A store tracks fixed-window counters per key. Implementations may be
 * process-local (memory) or shared across processes (Redis). Stores must be
 * safe to call concurrently and must resolve their own expiry semantics.
 */
export interface RateLimitCounterResult {
    /** Number of requests observed in the current window for the key. */
    count: number;
    /** Epoch milliseconds at which the current window resets. */
    resetTime: number;
}

export interface RateLimitStore {
    readonly kind: 'memory' | 'redis';

    /**
     * Atomically increment the counter for `key` within a fixed window of
     * `windowMs`. Returns the resulting count and the window reset time.
     */
    increment(key: string, windowMs: number): Promise<RateLimitCounterResult>;

    /**
     * Decrement the counter for `key` (used to refund successful requests).
     * Must never go below zero. Implementations that recreate the key while
     * flooring must re-anchor its expiry to `windowMs` so no key is left
     * without a TTL.
     */
    decrement(key: string, windowMs: number): Promise<void>;

    /** Release any underlying connections. Safe to call multiple times. */
    close?(): Promise<void>;
}
