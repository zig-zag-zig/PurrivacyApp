import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { API_V1_PREFIX, createApiV1Routes } from '../../../../src/api/v1Routes';
import { rateLimiter } from '../../../../src/api/middleware/rateLimiter';

// The feature routers pull in Firebase Admin, which cannot initialize in unit
// tests. Substitute empty routers: the general limiter wiring is exactly what
// this test covers.
jest.mock('../../../../src/features/mfa/api/mfaRoutes', () => ({
    __esModule: true,
    default: express.Router(),
}));
jest.mock('../../../../src/features/session/api/sessionRoutes', () => ({
    __esModule: true,
    default: express.Router(),
}));
jest.mock('../../../../src/features/user/api/userRoutes', () => ({
    __esModule: true,
    default: express.Router(),
}));

describe('general rate limiter coverage', () => {
    it('is mounted after /health and before every feature router', () => {
        const stack = createApiV1Routes().stack as Array<{
            route?: { path?: string | string[] };
            handle: unknown;
        }>;

        const generalIndex = stack.findIndex(layer => layer.handle === rateLimiter.general);
        expect(generalIndex).toBeGreaterThan(-1);

        const healthIndex = stack.findIndex(layer => layer.route?.path === '/health');
        expect(healthIndex).toBeGreaterThan(-1);
        expect(healthIndex).toBeLessThan(generalIndex);

        // Everything after the general limiter must be a nested router
        // (user/auth/mfa) — no unguarded route layers.
        for (let i = generalIndex + 1; i < stack.length; i++) {
            expect(stack[i].route).toBeUndefined();
            expect(stack[i].handle).toHaveProperty('stack');
        }
    });

    it('enforces the general limiter on non-health routes over real HTTP', async () => {
        const app = express();
        app.use(API_V1_PREFIX, createApiV1Routes());

        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>(resolve => server.once('listening', resolve));
        const port = (server.address() as AddressInfo).port;

        const get = (path: string): Promise<{ status: number; limit?: string }> => (
            new Promise((resolve, reject) => {
                http.get({ host: '127.0.0.1', port, path }, res => {
                    res.resume();
                    res.on('end', () => resolve({
                        status: res.statusCode ?? 0,
                        limit: res.headers['x-ratelimit-limit'] as string | undefined,
                    }));
                }).on('error', reject);
            })
        );

        try {
            // Unique path so this test owns its counter.
            const probePath = `/v1/rate-limit-coverage-${Date.now()}`;

            for (let i = 0; i < 100; i++) {
                const response = await get(probePath);
                expect(response.status).toBe(404);
                expect(response.limit).toBe('100');
            }

            const limited = await get(probePath);
            expect(limited.status).toBe(429);

            // The health endpoint used by the Docker healthcheck is exempt.
            const health = await get('/v1/health');
            expect(health.status).toBe(200);
        } finally {
            server.close();
        }
    });
});
