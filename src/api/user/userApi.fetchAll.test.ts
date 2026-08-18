import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../runtime', () => ({
    getApiRuntime: () => ({ identity: { getUserId: () => 'user', getUser: () => ({ getIdToken: async () => 't' }) } }),
    configureApiRuntime: vi.fn(),
}));
vi.mock('../core/buildApiUrl', () => ({
    buildApiUrl: (endpoint: string) => `https://api.example.test/v1${endpoint}`,
}));

const request = vi.fn();

import { createUserApi } from './userApi';

const record = (id: string) => ({ recordId: id, encryptedData: 'ed', iv: 'iv', tag: 'tag' });

describe('userApi.fetchAllKeyRecords (backend key-record pagination)', () => {
    const api = createUserApi(request);

    beforeEach(() => {
        request.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('fetches a single page when there is no nextCursor', async () => {
        request.mockResolvedValueOnce({ keys: [record('a'), record('b')] });

        const keys = await api.fetchAllKeyRecords();

        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toBe('/user/key-records?limit=500');
        expect(keys).toHaveLength(2);
    });

    it('follows cursors until nextCursor is absent', async () => {
        request
            .mockResolvedValueOnce({ keys: [record('a')], nextCursor: 'c1' })
            .mockResolvedValueOnce({ keys: [record('b')], nextCursor: 'c2' })
            .mockResolvedValueOnce({ keys: [record('c')] });

        const keys = await api.fetchAllKeyRecords();

        expect(request).toHaveBeenCalledTimes(3);
        expect(request.mock.calls[0][0]).toBe('/user/key-records?limit=500');
        expect(request.mock.calls[1][0]).toBe('/user/key-records?limit=500&cursor=c1');
        expect(request.mock.calls[2][0]).toBe('/user/key-records?limit=500&cursor=c2');
        expect(keys.map(k => k.recordId)).toEqual(['a', 'b', 'c']);
    });

    it('forwards limit and since options', async () => {
        request.mockResolvedValueOnce({ keys: [record('a')] });

        await api.fetchAllKeyRecords({ limit: 10, since: 1234567890 });

        expect(request).toHaveBeenCalledWith(
            '/user/key-records?limit=10&since=1234567890',
            'GET',
            undefined,
            true,
        );
    });
});
