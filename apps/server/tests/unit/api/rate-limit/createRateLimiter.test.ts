import { NextFunction, Request, Response } from 'express';
import { createRateLimiter } from '../../../../src/api/rate-limit/createRateLimiter';
import { RateLimitError } from '../../../../src/utils/errors';
import { RateLimitConfig } from '../../../../src/api/rate-limit/rateLimitTypes';
import { RateLimitStore } from '../../../../src/api/rate-limit/rateLimitStoreTypes';

const mockReq = (overrides: Partial<Request> = {}): Request => ({
    headers: {},
    method: 'GET',
    path: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    connection: { remoteAddress: '127.0.0.1' },
    ...overrides,
} as unknown as Request);

const mockRes = (): Response & { headers: Record<string, string>; statusCodeValue?: number; finishListeners: Array<() => void> } => {
    const res = {
        headers: {} as Record<string, string>,
        locals: {},
        statusCodeValue: 200,
        finishListeners: [] as Array<() => void>,
        setHeader(name: string, value: string) {
            res.headers[name] = value;
            return res;
        },
        get statusCode() {
            return res.statusCodeValue;
        },
        set statusCode(val: number) {
            res.statusCodeValue = val;
        },
        writeHead(statusCode: number) {
            res.statusCodeValue = statusCode;
            return res;
        },
        once(event: string, fn: () => void) {
            if (event === 'finish') {
                res.finishListeners.push(fn);
            }
            return res;
        },
    } as unknown as Response & { headers: Record<string, string>; statusCodeValue?: number; finishListeners: Array<() => void> };
    return res;
};

type Limiter = (req: Request, res: Response, next: NextFunction) => void;

/** Invoke the (async internally) middleware and resolve with the error passed to next. */
const invoke = (limiter: Limiter, req: Request, res: Response): Promise<unknown> => (
    new Promise(resolve => {
        limiter(req, res, (error?: unknown) => resolve(error));
    })
);

const fireFinish = (res: ReturnType<typeof mockRes>, statusCode: number): void => {
    res.statusCode = statusCode;
    res.finishListeners.forEach(listener => listener());
};

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

// Every test uses its own stable key so tests never share counters through
// the process-wide store.
let keySequence = 0;
const config = (overrides: Partial<RateLimitConfig> = {}): RateLimitConfig => {
    const key = `createRateLimiter.test:${++keySequence}`;
    return {
        windowMs: 1000,
        maxRequests: 3,
        keyGenerator: () => key,
        ...overrides,
    };
};

describe('createRateLimiter', () => {
    it('allows requests under the limit', async () => {
        const limiter = createRateLimiter(config());

        for (let i = 0; i < 3; i++) {
            const error = await invoke(limiter, mockReq(), mockRes());
            expect(error).toBeUndefined();
        }
    });

    it('passes RateLimitError to next at the limit', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 2 }));
        const req = mockReq();
        const res = mockRes();

        expect(await invoke(limiter, req, res)).toBeUndefined();
        expect(await invoke(limiter, req, res)).toBeUndefined();

        const error = await invoke(limiter, req, res);
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).statusCode).toBe(429);
    });

    it('resets count after window expires', async () => {
        const limiter = createRateLimiter(config({ windowMs: 50, maxRequests: 1 }));
        const req = mockReq();

        expect(await invoke(limiter, req, mockRes())).toBeUndefined();
        expect(await invoke(limiter, req, mockRes())).toBeInstanceOf(RateLimitError);

        // Wait for window to expire
        await new Promise(resolve => setTimeout(resolve, 60));

        expect(await invoke(limiter, req, mockRes())).toBeUndefined();
    });

    it('sets correct X-RateLimit headers', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 5 }));
        const res = mockRes();

        await invoke(limiter, mockReq(), res);

        expect(res.headers['X-RateLimit-Limit']).toBe('5');
        expect(res.headers['X-RateLimit-Remaining']).toBe('4');
        expect(res.headers['X-RateLimit-Reset']).toBeDefined();
        expect(res.headers['X-RateLimit-Policy']).toBe('5;w=1');
    });

    it('sets Retry-After header on rate limit exceeded', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 1 }));
        const req = mockReq();
        const res = mockRes();

        await invoke(limiter, req, res);
        const error = await invoke(limiter, req, res);

        expect(error).toBeInstanceOf(RateLimitError);
        expect(res.headers['Retry-After']).toBeDefined();
        expect(res.headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('uses custom keyGenerator when provided', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 1 }));

        expect(await invoke(limiter, mockReq({ path: '/a' }), mockRes())).toBeUndefined();

        // Same generated key → should be rate limited
        const error = await invoke(limiter, mockReq({ path: '/b' }), mockRes());
        expect(error).toBeInstanceOf(RateLimitError);
    });

    it('provides correct error details on rate limit exceeded', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 1, message: 'Custom limit message' }));
        const req = mockReq();

        await invoke(limiter, req, mockRes());
        const error = await invoke(limiter, req, mockRes());

        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toBe('Custom limit message');
        expect((error as RateLimitError).details).toMatchObject({
            limit: 1,
            window: 1,
        });
    });

    it('refunds successful requests when skipSuccessfulRequests is set', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 1, skipSuccessfulRequests: true }));
        const req = mockReq();
        const res = mockRes();

        expect(await invoke(limiter, req, res)).toBeUndefined();
        fireFinish(res, 200);
        await tick();

        // Refunded → second request is allowed
        const res2 = mockRes();
        expect(await invoke(limiter, req, res2)).toBeUndefined();
        fireFinish(res2, 200);
        await tick();
    });

    it('does not refund failed requests when skipSuccessfulRequests is set', async () => {
        const limiter = createRateLimiter(config({ maxRequests: 1, skipSuccessfulRequests: true }));
        const req = mockReq();
        const res = mockRes();

        expect(await invoke(limiter, req, res)).toBeUndefined();
        // No finish event → no refund

        expect(await invoke(limiter, req, mockRes())).toBeInstanceOf(RateLimitError);
    });
});

describe('createRateLimiter store failure handling', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    const failingStore: RateLimitStore = {
        kind: 'memory',
        increment: jest.fn().mockRejectedValue(new Error('store down')),
        decrement: jest.fn().mockResolvedValue(undefined),
    };

    it('fails open to a local memory store for non-critical limiters', async () => {
        const limiter = createRateLimiter(
            config({ maxRequests: 1, name: 'nonCritical', keyGenerator: () => 'fail-open-key' }),
            failingStore,
        );

        expect(await invoke(limiter, mockReq(), mockRes())).toBeUndefined();

        // Fallback store is now in use: second request with same key hits the limit
        const error = await invoke(limiter, mockReq(), mockRes());
        expect(error).toBeInstanceOf(RateLimitError);
    });

    it('rejects with 503 when a critical limiter runs fail-closed', async () => {
        jest.resetModules();
        process.env.RATE_LIMIT_FAIL_CLOSED = 'true';
        process.env.NODE_ENV = 'test';
        const fresh = require('../../../../src/api/rate-limit/createRateLimiter') as typeof import('../../../../src/api/rate-limit/createRateLimiter');

        const limiter = fresh.createRateLimiter(
            { ...config({ maxRequests: 1, name: 'critical', critical: true }), keyGenerator: () => 'fail-closed-key' },
            failingStore,
        );
        const res = mockRes();
        const error = await invoke(limiter, mockReq(), res) as { statusCode?: number } | undefined;

        expect(error).toBeDefined();
        expect(error?.statusCode).toBe(503);
        expect(res.headers['Retry-After']).toBe('60');
    });

    it('fails open for critical limiters when fail-closed is disabled', async () => {
        jest.resetModules();
        delete process.env.RATE_LIMIT_FAIL_CLOSED;
        process.env.NODE_ENV = 'test';
        const fresh = require('../../../../src/api/rate-limit/createRateLimiter') as typeof import('../../../../src/api/rate-limit/createRateLimiter');

        const limiter = fresh.createRateLimiter(
            { ...config({ maxRequests: 1, name: 'critical', critical: true }), keyGenerator: () => 'critical-open-key' },
            failingStore,
        );

        expect(await invoke(limiter, mockReq(), mockRes())).toBeUndefined();
    });
});
