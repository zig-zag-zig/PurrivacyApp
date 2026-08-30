jest.mock('ioredis', () => {
    const mockRedis = jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        eval: jest.fn(),
        quit: jest.fn().mockResolvedValue(undefined),
    }));
    return mockRedis;
});

describe('rate limit store factory', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
        jest.resetModules();
    });

    const loadFactory = () => require('../../../../src/api/rate-limit/rateLimitStoreFactory') as typeof import('../../../../src/api/rate-limit/rateLimitStoreFactory');

    it('selects the memory store by default', () => {
        delete process.env.RATE_LIMIT_STORE;
        const factory = loadFactory();
        const store = factory.getRateLimitStore();
        expect(store.kind).toBe('memory');
    });

    it('selects the memory store for unknown values', () => {
        process.env.RATE_LIMIT_STORE = 'bogus';
        const factory = loadFactory();
        expect(factory.getRateLimitStore().kind).toBe('memory');
    });

    it('selects the redis store when configured', () => {
        process.env.RATE_LIMIT_STORE = 'redis';
        process.env.REDIS_URL = 'redis://cache:6379';
        const factory = loadFactory();
        const store = factory.getRateLimitStore();
        expect(store.kind).toBe('redis');
    });

    it('returns the same shared store instance until reset', () => {
        delete process.env.RATE_LIMIT_STORE;
        const factory = loadFactory();
        expect(factory.getRateLimitStore()).toBe(factory.getRateLimitStore());
    });

    it('reset seam drops the cached store', () => {
        delete process.env.RATE_LIMIT_STORE;
        const factory = loadFactory();
        const first = factory.getRateLimitStore();
        factory.resetRateLimitStoreForTests();
        const second = factory.getRateLimitStore();
        expect(second).not.toBe(first);
    });

    it('closes and re-initializes the shared store', async () => {
        process.env.RATE_LIMIT_STORE = 'redis';
        process.env.REDIS_URL = 'redis://cache:6379';
        const factory = loadFactory();
        const store = factory.getRateLimitStore();
        await factory.closeRateLimitStore();
        expect(factory.getRateLimitStore()).not.toBe(store);
    });
});
