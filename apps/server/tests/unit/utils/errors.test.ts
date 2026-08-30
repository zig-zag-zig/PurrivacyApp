import {
    AppError,
    BadRequestError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    AuthError,
    MfaAlreadyEnabledError,
    MfaSetupExpiredError,
    MfaNotEnabledError,
} from '../../../src/utils/errors';

describe('Error classes', () => {
    describe('AppError', () => {
        it('sets statusCode and message', () => {
            const err = new AppError('test', 418);
            expect(err.message).toBe('test');
            expect(err.statusCode).toBe(418);
        });

        it('is instance of Error', () => {
            expect(new AppError('test', 400)).toBeInstanceOf(Error);
        });

        it('passes details', () => {
            const err = new AppError('test', 400, { field: 'x' });
            expect(err.details).toEqual({ field: 'x' });
        });

        it('has correct prototype chain', () => {
            const err = new AppError('test', 400);
            // instanceof should work across the chain
            expect(err instanceof AppError).toBe(true);
            expect(err instanceof Error).toBe(true);
        });
    });

    describe('BadRequestError', () => {
        it('has statusCode 400 and default message', () => {
            const err = new BadRequestError();
            expect(err.statusCode).toBe(400);
            expect(err.message).toBe('Bad Request');
        });

        it('accepts custom message and details', () => {
            const err = new BadRequestError('Custom', { field: 'x' });
            expect(err.message).toBe('Custom');
            expect(err.details).toEqual({ field: 'x' });
        });

        it('is instance of AppError', () => {
            expect(new BadRequestError()).toBeInstanceOf(AppError);
        });
    });

    describe('NotFoundError', () => {
        it('has statusCode 404', () => {
            expect(new NotFoundError().statusCode).toBe(404);
        });
    });

    describe('ConflictError', () => {
        it('has statusCode 409', () => {
            expect(new ConflictError().statusCode).toBe(409);
        });
    });

    describe('RateLimitError', () => {
        it('has statusCode 429', () => {
            expect(new RateLimitError().statusCode).toBe(429);
        });
    });

    describe('AuthError', () => {
        it('accepts 401 or 403 status codes', () => {
            expect(new AuthError('Unauthorized', { sessionInvalid: true }, 401).statusCode).toBe(401);
            expect(new AuthError('Forbidden', { mfaRequired: true }, 403).statusCode).toBe(403);
        });

        it('stores AuthErrorDetails in details', () => {
            const err = new AuthError('MFA required', { mfaRequired: true, sessionInvalid: true }, 403);
            expect(err.details).toEqual({ mfaRequired: true, sessionInvalid: true });
        });
    });

    describe('MfaAlreadyEnabledError', () => {
        it('is a ConflictError with 409', () => {
            const err = new MfaAlreadyEnabledError();
            expect(err).toBeInstanceOf(ConflictError);
            expect(err.statusCode).toBe(409);
            expect(err.message).toContain('already enabled');
        });
    });

    describe('MfaSetupExpiredError', () => {
        it('is a BadRequestError with 400', () => {
            const err = new MfaSetupExpiredError();
            expect(err).toBeInstanceOf(BadRequestError);
            expect(err.statusCode).toBe(400);
            expect(err.message).toContain('expired');
        });
    });

    describe('MfaNotEnabledError', () => {
        it('is a BadRequestError with 400', () => {
            const err = new MfaNotEnabledError();
            expect(err).toBeInstanceOf(BadRequestError);
            expect(err.statusCode).toBe(400);
            expect(err.message).toContain('not enabled');
        });
    });
});
