/**
 * Snapshot tests for API response shapes and error response classes.
 * These catch accidental changes to the public API contract.
 */
import { ResponseUtils } from '../../../src/utils/responseUtils';
import { createMockResponse } from '../../../tests/helpers/testFixtures';
import { AuthError, BadRequestError, ConflictError, NotFoundError, RateLimitError } from '../../../src/utils/errors';

describe('Response shape snapshots', () => {
    describe('success responses', () => {
        it('matches snapshot for simple success', () => {
            const res = createMockResponse();
            ResponseUtils.success(res, { status: 'healthy' });
            expect(res.body).toMatchSnapshot();
        });

        it('matches snapshot for success with recovery codes', () => {
            const res = createMockResponse();
            res.locals.newRecoveryCodes = ['CODE-A', 'CODE-B'];
            ResponseUtils.successWithRecoveryCodes(res, { mfaTrusted: true });
            expect(res.body).toMatchSnapshot();
        });

        it('matches snapshot for success with data and status', () => {
            const res = createMockResponse();
            ResponseUtils.success(res, { id: 'abc', name: 'test' }, 201);
            expect({ statusCode: res.statusCodeValue, body: res.body }).toMatchSnapshot();
        });
    });

    describe('error responses', () => {
        it('matches snapshot for generic error (500)', () => {
            const res = createMockResponse();
            ResponseUtils.error(res, 'Something went wrong');
            expect(res.body).toMatchSnapshot();
        });

        it('matches snapshot for bad request (400)', () => {
            const res = createMockResponse();
            ResponseUtils.badRequest(res, 'Invalid input');
            expect(res.body).toMatchSnapshot();
        });

        it('matches snapshot for no content (204)', () => {
            const res = createMockResponse();
            ResponseUtils.noContent(res);
            expect({ statusCode: res.statusCodeValue, body: res.body }).toMatchSnapshot();
        });
    });

    describe('error class shapes', () => {
        const toPlain = (e: Error & { statusCode: number; details: Record<string, unknown> }) => ({
            name: e.constructor.name,
            message: e.message,
            statusCode: e.statusCode,
            details: e.details,
        });

        it('matches snapshot for BadRequestError', () => {
            expect(toPlain(new BadRequestError('test') as any)).toMatchSnapshot();
        });

        it('matches snapshot for NotFoundError', () => {
            expect(toPlain(new NotFoundError('not found') as any)).toMatchSnapshot();
        });

        it('matches snapshot for ConflictError', () => {
            expect(toPlain(new ConflictError('conflict') as any)).toMatchSnapshot();
        });

        it('matches snapshot for AuthError', () => {
            expect(toPlain(new AuthError('unauthorized', { mfaRequired: true }, 403) as any)).toMatchSnapshot();
        });

        it('matches snapshot for RateLimitError', () => {
            expect(toPlain(new RateLimitError('too many') as any)).toMatchSnapshot();
        });
    });
});
