import { NextFunction } from 'express';
import { createMockRequest, createMockResponse } from '../../../helpers/testFixtures';

type RequestMetadataModule = typeof import('../../../../src/api/middleware/requestMetadata');

const loadMiddleware = (): RequestMetadataModule => {
    jest.resetModules();
    return require('../../../../src/api/middleware/requestMetadata') as RequestMetadataModule;
};

describe('requestMetadata', () => {
    it('sets device context, security headers, and allowed CORS origins', () => {
        process.env.ALLOWED_ORIGINS = 'https://app.example';
        const { requestMetadata: middleware } = loadMiddleware();
        const req = createMockRequest({
            headers: { origin: 'https://app.example', 'x-device-id': ['device-1', 'device-2'] },
        });
        const res = createMockResponse();
        const next: NextFunction = jest.fn();

        middleware(req, res, next);

        expect((req as Record<string, unknown>).deviceId).toBe('device-1');
        expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
        expect(res.headers['X-Frame-Options']).toBe('DENY');
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('responds to CORS preflight without continuing the middleware chain', () => {
        const { requestMetadata } = loadMiddleware();
        const req = createMockRequest({ method: 'OPTIONS' });
        const res = createMockResponse();
        const next: NextFunction = jest.fn();

        requestMetadata(req, res, next);

        expect(res.statusCodeValue).toBe(204);
        expect(res.ended).toBe(true);
        expect(next).not.toHaveBeenCalled();
    });
});
