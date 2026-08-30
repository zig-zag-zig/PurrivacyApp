jest.mock('ioredis', () => {
    const instances: Array<{
        on: jest.Mock;
        eval: jest.Mock;
        quit: jest.Mock;
    }> = [];

    const mockRedis = jest.fn().mockImplementation(() => {
        const client = {
            on: jest.fn(),
            eval: jest.fn(),
            quit: jest.fn().mockResolvedValue(undefined),
        };
        instances.push(client);
        return client;
    });

    (mockRedis as unknown as { __mockInstances: typeof instances }).__mockInstances = instances;
    return mockRedis;
});

import Redis from 'ioredis';
import { RedisRateLimitStore } from '../../../../src/api/rate-limit/redisRateLimitStore';

const mockedRedis = Redis as unknown as jest.Mock & { __mockInstances: Array<{ eval: jest.Mock }> };

const lastClient = (): { eval: jest.Mock } => {
    const instances = mockedRedis.__mockInstances;
    expect(instances.length).toBeGreaterThan(0);
    return instances[instances.length - 1];
};

describe('RedisRateLimitStore', () => {
    beforeEach(() => {
        mockedRedis.mockClear();
        mockedRedis.__mockInstances.length = 0;
    });

    it('creates a lazy, fail-fast client (no connection until first command)', () => {
        new RedisRateLimitStore('redis://example:6379');

        expect(mockedRedis).toHaveBeenCalledTimes(1);
        const options = mockedRedis.mock.calls[0][1];
        expect(options.lazyConnect).toBe(true);
        expect(options.enableOfflineQueue).toBe(false);
        expect(options.maxRetriesPerRequest).toBe(1);
    });

    it('increments atomically with a prefixed key and returns count + reset time', async () => {
        const store = new RedisRateLimitStore('redis://example:6379');
        const client = lastClient();
        client.eval.mockResolvedValueOnce([3, 42_000]);

        const before = Date.now();
        const result = await store.increment('user:1', 60_000);

        expect(client.eval).toHaveBeenCalledTimes(1);
        const [script, numKeys, key, windowMs] = client.eval.mock.calls[0];
        expect(numKeys).toBe(1);
        expect(key).toBe('purrivacy:rl:user:1');
        expect(windowMs).toBe(60_000);
        expect(script).toContain('INCR');
        expect(script).toContain('PEXPIRE');
        // Self-healing: an existing key without an expiry must be re-anchored
        // so no key in the namespace can outlive one window.
        expect(script).toContain('ttl == -1');
        expect(script.match(/PEXPIRE/g)).toHaveLength(2);

        expect(result.count).toBe(3);
        expect(result.resetTime).toBeGreaterThanOrEqual(before + 42_000);
        expect(result.resetTime).toBeLessThanOrEqual(Date.now() + 42_000);
    });

    it('falls back to now + windowMs when TTL is missing', async () => {
        const store = new RedisRateLimitStore('redis://example:6379');
        const client = lastClient();
        client.eval.mockResolvedValueOnce([1, -1]);

        const before = Date.now();
        const result = await store.increment('user:1', 60_000);

        expect(result.count).toBe(1);
        expect(result.resetTime).toBeGreaterThanOrEqual(before + 60_000 - 5);
    });

    it('decrements with a prefixed key', async () => {
        const store = new RedisRateLimitStore('redis://example:6379');
        const client = lastClient();

        await store.decrement('user:1', 60_000);

        const [script, numKeys, key] = client.eval.mock.calls[0];
        expect(numKeys).toBe(1);
        expect(key).toBe('purrivacy:rl:user:1');
        expect(script).toContain('DECR');
    });

    it('propagates store errors to the caller', async () => {
        const store = new RedisRateLimitStore('redis://example:6379');
        const client = lastClient();
        client.eval.mockRejectedValueOnce(new Error('connection refused'));

        await expect(store.increment('user:1', 60_000)).rejects.toThrow('connection refused');
    });

    it('closes the client', async () => {
        const store = new RedisRateLimitStore('redis://example:6379');
        const client = lastClient();

        await store.close();

        expect(client.quit).toHaveBeenCalledTimes(1);
    });
});
