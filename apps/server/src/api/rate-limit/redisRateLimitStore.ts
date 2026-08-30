import Redis from 'ioredis';
import { createLogger } from '../../utils/logger';
import { RateLimitCounterResult, RateLimitStore } from './rateLimitStoreTypes';

const logger = createLogger('api.rateLimit.redis');

/**
 * Key namespace. App-specific because this Redis instance may be shared
 * with other services on the same VPS (e.g. Pawify's Dapr state/lock keys);
 * the prefix guarantees Purrivacy can never read, overwrite, or evict
 * another service's keys (or vice versa).
 */
const KEY_PREFIX = 'purrivacy:rl:';

/**
 * Atomic fixed-window increment: INCR the counter and set an expiry when the
 * key is new, anchoring the window to the first request. Self-healing: if the
 * key somehow exists without an expiry (e.g. an orphan left by an older
 * deployment or manual intervention), the expiry is (re)applied — a key in
 * this namespace can never outlive one window.
 */
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl == -1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

/**
 * Refund a successful request. Floors at zero; a zeroed key is re-anchored
 * to the window TTL so the refund can never leave a key that never expires
 * (only the INCR path would otherwise set an expiry).
 */
const DECREMENT_SCRIPT = `
local current = redis.call('DECR', KEYS[1])
if current < 0 then
  redis.call('SET', KEYS[1], 0)
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/**
 * Shared (cross-process) fixed-window rate limit store backed by Redis.
 *
 * The client is lazy: no connection is established until the first command.
 * Commands fail fast when the connection is down (offline queue disabled,
 * single retry) so the caller's fail-closed policy can reject requests
 * quickly instead of hanging.
 */
export class RedisRateLimitStore implements RateLimitStore {
    readonly kind = 'redis' as const;

    private readonly client: Redis;

    constructor(url: string) {
        this.client = new Redis(url, {
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            connectTimeout: 2000,
            retryStrategy: (times: number) => Math.min(times * 200, 2000),
        });
        this.client.on('error', (error: Error) => {
            logger.error('redis rate limit store error', { error });
        });
    }

    async increment(key: string, windowMs: number): Promise<RateLimitCounterResult> {
        const result = await this.client.eval(
            INCREMENT_SCRIPT,
            1,
            `${KEY_PREFIX}${key}`,
            windowMs,
        ) as [number, number];

        const count = Number(result[0]);
        const ttlMs = Number(result[1]);
        const resetTime = ttlMs >= 0 ? Date.now() + ttlMs : Date.now() + windowMs;
        return { count, resetTime };
    }

    async decrement(key: string, windowMs: number): Promise<void> {
        await this.client.eval(DECREMENT_SCRIPT, 1, `${KEY_PREFIX}${key}`, windowMs);
    }

    async close(): Promise<void> {
        await this.client.quit();
    }
}
