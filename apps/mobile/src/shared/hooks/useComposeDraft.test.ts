import { beforeEach, describe, expect, it, vi } from 'vitest';

import { draftService } from './useComposeDraft';

const store = new Map<string, string>();

vi.mock('../../features/security/services/encryptedSqliteValueStore', () => ({
    getEncryptedSqliteValue: vi.fn(async (key: string) => store.get(key) ?? null),
    setEncryptedSqliteValue: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
    }),
    deleteEncryptedSqliteValue: vi.fn(async (key: string) => {
        store.delete(key);
    }),
}));

vi.mock('../../utils/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('draftService', () => {
    beforeEach(() => {
        store.clear();
        vi.clearAllMocks();
    });

    it('saves and loads a draft namespaced per user', async () => {
        await draftService.save('alice', 'encrypt', 'hello world');
        await draftService.save('bob', 'encrypt', 'bob draft');

        expect(await draftService.load('alice', 'encrypt')).toBe('hello world');
        expect(await draftService.load('bob', 'encrypt')).toBe('bob draft');
        // Different slots do not collide.
        expect(await draftService.load('alice', 'decrypt')).toBeNull();
    });

    it('saving an empty value clears the draft', async () => {
        await draftService.save('alice', 'encrypt', 'draft');
        await draftService.save('alice', 'encrypt', '   ');
        expect(await draftService.load('alice', 'encrypt')).toBeNull();
    });

    it('clear removes the draft', async () => {
        await draftService.save('alice', 'encrypt', 'draft');
        await draftService.clear('alice', 'encrypt');
        expect(await draftService.load('alice', 'encrypt')).toBeNull();
    });
});
