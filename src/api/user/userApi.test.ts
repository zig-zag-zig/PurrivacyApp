import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRuntime } from '../runtime';

const mockRuntime = vi.hoisted(() => ({} as Partial<ApiRuntime>));

vi.mock('../runtime', () => ({
    getApiRuntime: () => mockRuntime,
    configureApiRuntime: vi.fn(),
}));

vi.mock('../core/buildApiUrl', () => ({
    buildApiUrl: (endpoint: string) => `https://api.example.test/v1${endpoint}`,
}));

import { ApiRequestError, ApiSchemaError } from '../apiError';
import { createUserApi } from './userApi';

describe('createUserApi.create (direct-fetch boundary, LANE M)', () => {
    const originalFetch = globalThis.fetch;

    const userPayload = {
        dekPassword: { encryptedData: 'a', iv: 'b', tag: 'c', salt: 'd' },
        dekSeed: { encryptedData: 'e', iv: 'f', tag: 'g', salt: 'h' },
        keys: [],
        recoveryVerifierSalt: 'salt',
        recoveryVerifierHash: 'hash',
    };

    // Backend POST /user (registration) returns { success: boolean } —
    // verified against the API source (userRoutes.ts → createUser).
    const validUserResponse = { success: true };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mockRuntime, {
            identity: {
                getUserId: () => 'user-id',
                getUser: () => ({ getIdToken: async () => 'id-token' }),
            },
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('validates a well-formed user response instead of casting it through', async () => {
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(validUserResponse), { status: 201 }));

        const api = createUserApi(vi.fn());
        const result = await api.create(userPayload);

        expect(result).toEqual(validUserResponse);
    });

    it('rejects a malformed response with ApiSchemaError instead of leaking a cast', async () => {
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: 'nope' }), { status: 201 }));

        const api = createUserApi(vi.fn());
        await expect(api.create(userPayload)).rejects.toBeInstanceOf(ApiSchemaError);
    });

    it('rejects a missing-field response with ApiSchemaError', async () => {
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 201 }));

        const api = createUserApi(vi.fn());
        await expect(api.create(userPayload)).rejects.toBeInstanceOf(ApiSchemaError);
    });

    it('rejects success:false as a failed registration', async () => {
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 201 }));

        const api = createUserApi(vi.fn());
        await expect(api.create(userPayload)).rejects.toBeInstanceOf(ApiSchemaError);
    });

    it('still surfaces HTTP errors for non-ok responses', async () => {
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 400 }));

        const api = createUserApi(vi.fn());
        await expect(api.create(userPayload)).rejects.toMatchObject({
            name: 'ApiRequestError',
            status: 400,
        });
    });

    it('still rejects with ApiRequestError when the id token is missing', async () => {
        Object.assign(mockRuntime, {
            identity: {
                getUserId: () => 'user-id',
                getUser: () => null,
            },
        });

        const api = createUserApi(vi.fn());
        await expect(api.create(userPayload)).rejects.toBeInstanceOf(ApiRequestError);
    });
});
