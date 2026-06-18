import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEventService = vi.hoisted(() => ({
    addEvent: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

const mockHandleHttpError = vi.hoisted(() => vi.fn());
const mockParseResponseBody = vi.hoisted(() => vi.fn());

vi.mock('../../services/eventService', () => ({
    EventService: mockEventService,
}));

vi.mock('../../utils/logger', () => ({
    logger: mockLogger,
}));

vi.mock('./httpErrorHandler', () => ({
    handleHttpError: mockHandleHttpError,
}));

vi.mock('./parseResponseBody', () => ({
    parseResponseBody: mockParseResponseBody,
}));

// processResponse uses __DEV__ which Vitest doesn't define by default
(globalThis as any).__DEV__ = true;

import { processResponse } from './processResponse';

const requestFn = vi.fn();
const createSessionFn = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('processResponse', () => {
    it('returns undefined for 204 No Content', async () => {
        const response = new Response(null, { status: 204 });

        const result = await processResponse(
            response, '/test', 'DELETE', undefined,
            false, false, undefined, requestFn, createSessionFn,
        );

        expect(result).toBeUndefined();
    });

    it('adds x-request-id header to response data when present', async () => {
        const response = new Response('{"ok":true}', {
            status: 200,
            headers: { 'x-request-id': 'req-abc-123' },
        });
        mockParseResponseBody.mockResolvedValueOnce({ ok: true });

        await processResponse(
            response, '/test', 'GET', undefined,
            false, false, undefined, requestFn, createSessionFn,
        );

        expect(mockParseResponseBody).toHaveBeenCalledWith(response);
    });

    it('delegates non-ok responses to handleHttpError', async () => {
        const response = new Response('{"error":"bad"}', { status: 400 });
        mockParseResponseBody.mockResolvedValueOnce({ error: 'bad' });
        mockHandleHttpError.mockResolvedValueOnce({ handled: true });

        const result = await processResponse(
            response, '/test', 'POST', { data: 1 },
            true, true, undefined, requestFn, createSessionFn,
        );

        expect(mockHandleHttpError).toHaveBeenCalledWith(
            400,
            { error: 'bad' },
            '/test',
            'POST',
            { data: 1 },
            true,
            true,
            undefined,
            requestFn,
            createSessionFn,
        );
        expect(result).toEqual({ handled: true });
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'api response error body',
            expect.objectContaining({
                endpoint: '/test',
                method: 'POST',
                status: 400,
            }),
        );
    });

    it('emits closeMfaModal for non-session endpoints on ok responses', async () => {
        const response = new Response('{"ok":true}', { status: 200 });
        mockParseResponseBody.mockResolvedValueOnce({ ok: true });

        await processResponse(
            response, '/user/key-records', 'GET', undefined,
            false, false, undefined, requestFn, createSessionFn,
        );

        expect(mockEventService.addEvent).toHaveBeenCalledWith('closeMfaModal');
    });

    it('does not emit closeMfaModal for the /auth/session endpoint', async () => {
        const response = new Response('{"accessToken":"at"}', { status: 200 });
        mockParseResponseBody.mockResolvedValueOnce({ accessToken: 'at' });

        await processResponse(
            response, '/auth/session', 'POST', undefined,
            false, false, undefined, requestFn, createSessionFn,
        );

        expect(mockEventService.addEvent).not.toHaveBeenCalledWith('closeMfaModal');
    });

    it('emits newRecoveryCodes when response contains them', async () => {
        const response = new Response('{"newRecoveryCodes":["a","b","c"]}', { status: 200 });
        mockParseResponseBody.mockResolvedValueOnce({ newRecoveryCodes: ['a', 'b', 'c'] });

        await processResponse(
            response, '/mfa/recovery-codes/regenerate', 'POST', undefined,
            false, false, undefined, requestFn, createSessionFn,
        );

        expect(mockEventService.addEvent).toHaveBeenCalledWith(
            'newRecoveryCodes',
            { recoveryCodes: ['a', 'b', 'c'] },
        );
    });

    it('returns parsed data for successful responses', async () => {
        const response = new Response('{"data":"value"}', { status: 200 });
        mockParseResponseBody.mockResolvedValueOnce({ data: 'value' });

        const result = await processResponse(
            response, '/test', 'GET', undefined,
            false, false, undefined, requestFn, createSessionFn,
        );

        expect(result).toEqual({ data: 'value' });
    });
});
