import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../../../../src/api/middleware/requestContext';

const mockReq = (overrides: Partial<Request> = {}): Request => ({
    headers: {},
    method: 'GET',
    path: '/v1/user',
    ...overrides,
} as Request);

const mockRes = (): Response & { headers: Record<string, string>; locals: Record<string, unknown> } => {
    const res = {
        headers: {} as Record<string, string>,
        locals: {} as Record<string, unknown>,
        setHeader(name: string, value: string) {
            res.headers[name] = value;
            return res;
        },
    } as unknown as Response & { headers: Record<string, string>; locals: Record<string, unknown> };
    return res;
};

describe('requestContext', () => {
    it('generates a UUID and sets X-Request-ID header', () => {
        const req = mockReq();
        const res = mockRes();
        const next: NextFunction = jest.fn();

        requestContext(req, res, next);

        expect(res.locals.requestId).toBeDefined();
        expect(typeof res.locals.requestId).toBe('string');
        expect(res.locals.requestId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(res.headers['X-Request-ID']).toBe(res.locals.requestId);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('uses incoming X-Request-ID when provided', () => {
        const req = mockReq({ headers: { 'x-request-id': 'custom-request-id-123' } });
        const res = mockRes();
        const next: NextFunction = jest.fn();

        requestContext(req, res, next);

        expect(res.locals.requestId).toBe('custom-request-id-123');
        expect(res.headers['X-Request-ID']).toBe('custom-request-id-123');
    });

    it('truncates X-Request-ID to 80 characters', () => {
        const longId = 'a'.repeat(200);
        const req = mockReq({ headers: { 'x-request-id': longId } });
        const res = mockRes();
        const next: NextFunction = jest.fn();

        requestContext(req, res, next);

        expect(res.locals.requestId).toHaveLength(80);
        expect(res.headers['X-Request-ID']).toHaveLength(80);
    });

    it('ignores whitespace-only X-Request-ID and generates a UUID', () => {
        const req = mockReq({ headers: { 'x-request-id': '   ' } });
        const res = mockRes();
        const next: NextFunction = jest.fn();

        requestContext(req, res, next);

        expect(res.locals.requestId).not.toBe('   ');
        expect(res.locals.requestId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
    });

    it('sets startedAt timestamp on res.locals', () => {
        const before = Date.now();
        const req = mockReq();
        const res = mockRes();
        const next: NextFunction = jest.fn();

        requestContext(req, res, next);

        const after = Date.now();
        expect(typeof res.locals.startedAt).toBe('number');
        expect(res.locals.startedAt).toBeGreaterThanOrEqual(before);
        expect(res.locals.startedAt).toBeLessThanOrEqual(after);
    });
});
