import { describe, expect, it } from 'vitest';

import { parseResponseBody } from './parseResponseBody';

const makeResponse = (text: string, ok = true, status = 200): Response => ({
    ok,
    status,
    text: () => Promise.resolve(text),
    headers: new Headers(),
} as unknown as Response);

const makeEmptyResponse = (ok = true, status = 200): Response => ({
    ok,
    status,
    text: () => Promise.resolve(''),
    headers: new Headers(),
} as unknown as Response);

const makeJsonResponse = (data: object, ok = true, status = 200): Response =>
    makeResponse(JSON.stringify(data), ok, status);

describe('parseResponseBody', () => {
    it('parses valid JSON', async () => {
        const result = await parseResponseBody(makeJsonResponse({ key: 'value' }));
        expect(result).toEqual({ key: 'value' });
    });

    it('returns empty object for empty body', async () => {
        const result = await parseResponseBody(makeEmptyResponse());
        expect(result).toEqual({});
    });

    it('strips HTML from non-JSON error responses', async () => {
        const result = await parseResponseBody(makeResponse('<h1>Internal Server Error</h1>', false, 500));
        expect(result.error).toBe('Internal Server Error');
    });

    it('returns plain text as error for non-ok responses', async () => {
        const result = await parseResponseBody(makeResponse('Something went wrong', false, 400));
        expect(result.error).toBe('Something went wrong');
    });

    it('returns raw text as error for ok responses with non-JSON', async () => {
        const result = await parseResponseBody(makeResponse('plain text', true, 200));
        expect(result.error).toBe('plain text');
    });

    it('falls back to HTTP status message when HTML stripping leaves nothing', async () => {
        const result = await parseResponseBody(makeResponse('<br><br>', false, 502));
        expect(result.error).toBe('HTTP error! Status: 502');
    });
});
