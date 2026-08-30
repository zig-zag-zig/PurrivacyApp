import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';
import { MemoryRateLimitStore } from './memoryRateLimitStore';
import { RedisRateLimitStore } from './redisRateLimitStore';
import { RateLimitStore } from './rateLimitStoreTypes';

const logger = createLogger('api.rateLimit.store');

let sharedStore: RateLimitStore | null = null;

/**
 * Returns the process-wide rate limit store selected by configuration.
 *
 * `RATE_LIMIT_STORE=redis` requires `REDIS_URL` and creates a lazy Redis
 * client (no connection until the first request). Anything else uses the
 * bounded in-process memory store.
 */
export const getRateLimitStore = (): RateLimitStore => {
    if (sharedStore) {
        return sharedStore;
    }

    if (env.rateLimitStore === 'redis') {
        sharedStore = new RedisRateLimitStore(env.redisUrl ?? 'redis://127.0.0.1:6379');
    } else {
        sharedStore = new MemoryRateLimitStore();
    }

    logger.info('rate limit store initialized', { kind: sharedStore.kind });
    return sharedStore;
};

/**
 * Release the shared store's resources (e.g. Redis connection). Safe to call
 * more than once; subsequent requests re-initialize the store.
 */
export const closeRateLimitStore = async (): Promise<void> => {
    if (sharedStore?.close) {
        await sharedStore.close();
    }
    sharedStore = null;
};

/** Test seam: drops the cached store so a fresh one is created next call. */
export const resetRateLimitStoreForTests = (): void => {
    sharedStore = null;
};
