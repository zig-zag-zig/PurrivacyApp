import { MemoryRateLimitStore } from '../../../../src/api/rate-limit/memoryRateLimitStore';

describe('MemoryRateLimitStore', () => {
    it('increments a counter within the window', async () => {
        const store = new MemoryRateLimitStore();
        const first = await store.increment('key', 60_000);
        const second = await store.increment('key', 60_000);

        expect(first.count).toBe(1);
        expect(second.count).toBe(2);
        expect(second.resetTime).toBe(first.resetTime);
        expect(second.resetTime).toBeGreaterThan(Date.now());
    });

    it('resets the counter when the window expires', async () => {
        const store = new MemoryRateLimitStore();
        await store.increment('key', 30);

        await new Promise(resolve => setTimeout(resolve, 40));

        const result = await store.increment('key', 30);
        expect(result.count).toBe(1);
    });

    it('decrements a counter and floors at zero', async () => {
        const store = new MemoryRateLimitStore();
        await store.increment('key', 60_000);
        await store.decrement('key', 60_000);

        const result = await store.increment('key', 60_000);
        expect(result.count).toBe(1);

        await store.decrement('key', 60_000);
        await store.decrement('key', 60_000);
        const after = await store.increment('key', 60_000);
        expect(after.count).toBe(1);
    });

    it('bounded cardinality: evicts the soonest-expiring entry when full', async () => {
        const store = new MemoryRateLimitStore(3);
        await store.increment('soonest', 1_000);
        await store.increment('middle', 60_000);
        await store.increment('last', 60_000);

        // Fourth distinct key when full → evicts the entry expiring soonest
        await store.increment('new', 60_000);
        expect(store.size).toBe(3);

        // The evicted key starts a fresh window
        const revived = await store.increment('soonest', 60_000);
        expect(revived.count).toBe(1);
        expect(store.size).toBe(3);
    });

    it('does not evict existing keys when the store is not full', async () => {
        const store = new MemoryRateLimitStore(10);
        await store.increment('a', 60_000);
        await store.increment('b', 60_000);
        expect(store.size).toBe(2);
    });
});
