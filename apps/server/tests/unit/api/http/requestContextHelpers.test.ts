import { Request } from 'express';
import { requireAuthenticatedUserId, requireSessionFamilyId } from '../../../../src/api/http/requestContextHelpers';
import { AuthError } from '../../../../src/utils/errors';

describe('requestContextHelpers', () => {
    describe('requireAuthenticatedUserId', () => {
        it('returns userId when present', () => {
            const req = { userId: 'user-1' } as Request;
            expect(requireAuthenticatedUserId(req)).toBe('user-1');
        });

        it('throws AuthError 401 when userId is missing', () => {
            const req = {} as Request;
            expect(() => requireAuthenticatedUserId(req)).toThrow(AuthError);
            try {
                requireAuthenticatedUserId(req);
            } catch (err) {
                expect((err as AuthError).statusCode).toBe(401);
                expect((err as AuthError).details).toEqual({ sessionInvalid: true });
            }
        });

        it('throws AuthError with correct message', () => {
            const req = {} as Request;
            expect(() => requireAuthenticatedUserId(req)).toThrow('Session authentication required');
        });
    });

    describe('requireSessionFamilyId', () => {
        it('returns sessionFamilyId when present', () => {
            const req = { sessionFamilyId: 'fam-1' } as Request;
            expect(requireSessionFamilyId(req)).toBe('fam-1');
        });

        it('throws AuthError 401 when sessionFamilyId is missing', () => {
            const req = {} as Request;
            expect(() => requireSessionFamilyId(req)).toThrow(AuthError);
            try {
                requireSessionFamilyId(req);
            } catch (err) {
                expect((err as AuthError).statusCode).toBe(401);
                expect((err as AuthError).details).toEqual({ sessionInvalid: true });
            }
        });
    });
});
