import { NextFunction, Request, Response } from 'express';
import { createFakeFirestore } from '../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

jest.mock('../../../../src/features/mfa/application/verifyMfaCode', () => ({
    verifyMfaCode: jest.fn(),
}));

jest.mock('../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadMiddleware = (): typeof import('../../../../src/api/middleware/authMiddleware') => (
    require('../../../../src/api/middleware/authMiddleware')
);

const mockReq = (overrides: Partial<Request> = {}): Request => ({
    headers: {},
    method: 'GET',
    path: '/test',
    ...overrides,
} as Request);

const mockRes = (): Response & { locals: Record<string, unknown> } => {
    const res = {
        locals: {} as Record<string, unknown>,
        setHeader: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    } as unknown as Response & { locals: Record<string, unknown> };
    return res;
};

describe('authMiddleware', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.restoreAllMocks();
    });

    it('firebase method extracts userId from verified token (mocked AuthSessionService)', async () => {
        jest.mock('../../../../src/features/session/application/AuthSessionService', () => ({
            AuthSessionService: {
                extractUserIdFromToken: jest.fn().mockResolvedValue('user-1'),
            },
        }));

        jest.resetModules();
        const { authenticate } = require('../../../../src/api/middleware/authMiddleware') as typeof import('../../../../src/api/middleware/authMiddleware');

        const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
        const res = mockRes();
        const next = jest.fn() as NextFunction;

        const middleware = authenticate('firebase');
        await middleware(req, res, next);

        expect(req.userId).toBe('user-1');
        expect(next).toHaveBeenCalledWith();
    });

    it('session method passes 401 error to next() when no bearer token is provided', async () => {
        jest.mock('../../../../src/features/session/application/AuthSessionService', () => ({
            AuthSessionService: { extractUserIdFromToken: jest.fn() },
        }));

        jest.resetModules();
        const { authenticate } = require('../../../../src/api/middleware/authMiddleware') as typeof import('../../../../src/api/middleware/authMiddleware');

        const req = mockReq(); // No authorization header
        const res = mockRes();
        const next = jest.fn() as NextFunction;

        const middleware = authenticate('session');
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('not provided'),
            statusCode: 401,
        }));
    });

    it('session method passes error to next() when token validation fails', async () => {
        jest.mock('../../../../src/features/session/application/AuthSessionService', () => ({
            AuthSessionService: { extractUserIdFromToken: jest.fn() },
        }));
        jest.mock('../../../../src/features/session/application/validateSession', () => ({
            validateBackendSession: jest.fn().mockRejectedValue(
                new (require('../../../../src/utils/errors').AuthError)('Invalid token', { sessionInvalid: true }, 401)
            ),
        }));
        jest.mock('../../../../src/features/session/application/sessionDeletion', () => ({
            deleteAccessSession: jest.fn(),
        }));
        jest.mock('../../../../src/features/user/application/UserService', () => ({
            UserService: { getUserMfaState: jest.fn() },
        }));

        jest.resetModules();
        const { authenticate } = require('../../../../src/api/middleware/authMiddleware') as typeof import('../../../../src/api/middleware/authMiddleware');

        const req = mockReq({ headers: { authorization: 'Bearer bad-token' } });
        const res = mockRes();
        const next = jest.fn() as NextFunction;

        const middleware = authenticate('session');
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 401,
        }));
    });

    it('session method deletes session when user is not found (404)', async () => {
        const mockDeleteSession = jest.fn().mockResolvedValue(undefined);

        jest.mock('../../../../src/features/session/application/AuthSessionService', () => ({
            AuthSessionService: { extractUserIdFromToken: jest.fn() },
        }));
        jest.mock('../../../../src/features/session/application/validateSession', () => ({
            validateBackendSession: jest.fn().mockResolvedValue({ userId: 'user-1', refreshTokenFamilyId: 'fam-1' }),
        }));
        jest.mock('../../../../src/features/session/application/sessionDeletion', () => ({
            deleteAccessSession: mockDeleteSession,
        }));
        jest.mock('../../../../src/features/user/application/UserService', () => ({
            UserService: {
                getUserMfaState: jest.fn().mockRejectedValue(
                    new (require('../../../../src/utils/errors').NotFoundError)('User not found')
                ),
            },
        }));

        jest.resetModules();
        const { authenticate } = require('../../../../src/api/middleware/authMiddleware') as typeof import('../../../../src/api/middleware/authMiddleware');

        const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
        const res = mockRes();
        const next = jest.fn() as NextFunction;

        const middleware = authenticate('session');
        await middleware(req, res, next);

        // Should delete session on user-not-found
        expect(mockDeleteSession).toHaveBeenCalledWith('valid-token');
        // Should propagate the 404 error
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 404,
        }));
    });
});
