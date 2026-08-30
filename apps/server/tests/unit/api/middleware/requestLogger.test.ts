import { Request, Response } from 'express';

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('../../../../src/utils/logger', () => ({
    createLogger: () => mockLogger,
}));

const loadMiddleware = (): typeof import('../../../../src/api/middleware/requestLogger') => (
    require('../../../../src/api/middleware/requestLogger')
);

describe('requestLogger', () => {
    let finishCallback: (() => void) | undefined;

    const makeReq = (path: string, method = 'GET'): Request => (
        { path, method } as Request
    );

    const makeRes = (statusCode: number): Response => {
        finishCallback = undefined;
        return {
            statusCode,
            locals: { startedAt: Date.now() - 100 },
            once: jest.fn((event: string, fn: () => void) => {
                if (event === 'finish') finishCallback = fn;
                return this;
            }),
        } as unknown as Response;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        finishCallback = undefined;
    });

    it('logs info for 200 responses', () => {
        const { requestLogger } = loadMiddleware();
        const req = makeReq('/v1/user');
        const res = makeRes(200);
        const next = jest.fn();

        requestLogger(req, res, next);
        expect(next).toHaveBeenCalled();
        finishCallback?.();

        expect(mockLogger.info).toHaveBeenCalledWith('request completed', expect.objectContaining({
            statusCode: 200, method: 'GET', path: '/v1/user',
        }));
    });

    it('logs warn for 400 responses', () => {
        const { requestLogger } = loadMiddleware();
        requestLogger(makeReq('/v1/user', 'POST'), makeRes(400), jest.fn());
        finishCallback?.();

        expect(mockLogger.warn).toHaveBeenCalledWith('request rejected', expect.objectContaining({ statusCode: 400 }));
    });

    it('logs error for 500 responses', () => {
        const { requestLogger } = loadMiddleware();
        requestLogger(makeReq('/v1/user'), makeRes(500), jest.fn());
        finishCallback?.();

        expect(mockLogger.error).toHaveBeenCalledWith('request failed', expect.objectContaining({ statusCode: 500 }));
    });

    it('skips logging for /health endpoint', () => {
        const { requestLogger } = loadMiddleware();
        requestLogger(makeReq('/health'), makeRes(200), jest.fn());
        finishCallback?.();

        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
    });
});
