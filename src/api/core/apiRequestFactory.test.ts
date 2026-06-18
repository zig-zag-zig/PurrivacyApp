import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildApiUrl = vi.hoisted(() => vi.fn((e: string) => `https://api.example.com${e}`));
const mockBuildAuthHeaders = vi.hoisted(() => vi.fn());
const mockBuildRequestBody = vi.hoisted(() => vi.fn(() => ({})));
const mockIsSensitiveAndRequiresMfa = vi.hoisted(() => vi.fn(async () => false));
const mockProcessResponse = vi.hoisted(() => vi.fn());
const mockHandleHttpError = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('./buildApiUrl', () => ({
    buildApiUrl: mockBuildApiUrl,
}));

vi.mock('../request/authHeaders', () => ({
    buildAuthHeaders: mockBuildAuthHeaders,
    buildRequestBody: mockBuildRequestBody,
}));

vi.mock('../request/mfaSensitivity', () => ({
    isSensitiveAndRequiresMfa: mockIsSensitiveAndRequiresMfa,
}));

vi.mock('../request/processResponse', () => ({
    processResponse: mockProcessResponse,
}));

vi.mock('../request/httpErrorHandler', () => ({
    handleHttpError: mockHandleHttpError,
}));

vi.mock('../../utils/logger', () => ({
    logger: mockLogger,
}));

import { createApiRequester, type ApiRequestFn } from './apiRequestFactory';

let request: ApiRequestFn;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }) as any);
    mockBuildAuthHeaders.mockResolvedValue({ 'Content-Type': 'application/json' });
    mockBuildRequestBody.mockReturnValue({});
    mockIsSensitiveAndRequiresMfa.mockResolvedValue(false);
    mockProcessResponse.mockImplementation(async (response: Response) => response.json());
    mockHandleHttpError.mockRejectedValue(new Error('unexpected http error handler call'));

    const createSession = vi.fn(async () => ({ accessToken: 'token', refreshToken: 'rt' }));
    request = createApiRequester(createSession);
});

describe('createApiRequester', () => {
    it('builds the correct URL via buildApiUrl', async () => {
        mockProcessResponse.mockResolvedValueOnce({ ok: true });

        await request('/test', 'GET', undefined, false, undefined, false);

        expect(mockBuildApiUrl).toHaveBeenCalledWith('/test');
    });

    it('calls buildAuthHeaders with requiresAuth and retryOnFailure', async () => {
        mockProcessResponse.mockResolvedValueOnce({ ok: true });

        await request('/test', 'GET', undefined, true, undefined, true);

        expect(mockBuildAuthHeaders).toHaveBeenCalledWith(
            true, true, expect.any(Function), undefined,
        );
    });

    it('passes requiresAuth = false when auth is not needed', async () => {
        mockProcessResponse.mockResolvedValueOnce({ ok: true });

        await request('/test', 'GET', undefined, false, undefined, false);

        expect(mockBuildAuthHeaders).toHaveBeenCalledWith(
            false, false, expect.any(Function), undefined,
        );
    });

    it('sends an empty JSON body for POST with JSON content-type', async () => {
        const response = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        mockProcessResponse.mockResolvedValueOnce({ ok: true });
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response as any);
        mockBuildRequestBody.mockReturnValueOnce({});

        await request('/test', 'POST', undefined, false, undefined, false);

        const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect((fetchCall[1] as RequestInit).body).toBe('{}');
    });

    it('omits body for GET requests', async () => {
        const response = new Response('{}', { status: 200 });
        mockProcessResponse.mockResolvedValueOnce({ ok: true });
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response as any);

        await request('/test', 'GET', { key: 'value' }, false, undefined, false);

        const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect((fetchCall[1] as RequestInit).body).toBeUndefined();
    });

    it('includes MFA code in request options', async () => {
        mockProcessResponse.mockResolvedValueOnce({ ok: true });

        await request('/test', 'POST', undefined, true, { mfaCode: '123456' }, true);

        expect(mockBuildAuthHeaders).toHaveBeenCalledWith(
            true, true, expect.any(Function), { mfaCode: '123456' },
        );
    });

    it('triggers pre-flight MFA check when endpoint is sensitive', async () => {
        mockIsSensitiveAndRequiresMfa.mockResolvedValueOnce(true);
        mockHandleHttpError.mockResolvedValueOnce({ ok: true });

        const result = await request('/user/change-password', 'POST', {}, true, undefined, true);

        expect(mockHandleHttpError).toHaveBeenCalledWith(
            403, { mfaRequiredSensitive: true },
            '/user/change-password', 'POST', {}, true, true,
            undefined, expect.any(Function), expect.any(Function),
        );
        expect(result).toEqual({ ok: true });
    });

    it('skips pre-flight MFA check when MFA is not required', async () => {
        mockIsSensitiveAndRequiresMfa.mockResolvedValueOnce(false);
        mockProcessResponse.mockResolvedValueOnce({ ok: true });

        await request('/user/change-password', 'POST', {}, true, undefined, true);

        expect(mockHandleHttpError).not.toHaveBeenCalled();
    });

    it('handles network fetch errors as ApiRequestError', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network down'));

        await expect(
            request('/test', 'GET', undefined, false, undefined, false),
        ).rejects.toMatchObject({
            name: 'ApiRequestError',
            isNetworkError: true,
        });

        expect(mockLogger.warn).toHaveBeenCalledWith(
            'api request failed before response',
            expect.objectContaining({ endpoint: '/test', method: 'GET' }),
        );
    });

    it('delegates successful responses to processResponse', async () => {
        const response = new Response('{"ok":true}', { status: 200 });
        mockProcessResponse.mockResolvedValueOnce({ ok: true });
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response as any);

        const result = await request('/test', 'GET', undefined, false, undefined, false);

        expect(mockProcessResponse).toHaveBeenCalledWith(
            response, '/test', 'GET', undefined, false, false,
            undefined, expect.any(Function), expect.any(Function),
        );
        expect(result).toEqual({ ok: true });
    });
});
