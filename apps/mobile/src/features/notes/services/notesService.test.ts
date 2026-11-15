import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    addKeyRecord: vi.fn(),
    updateKeyRecord: vi.fn(),
    encrypt: vi.fn(),
    getDek: vi.fn(),
}));

vi.mock('../../../api/client', () => ({
    ApiClient: {
        addKeyRecord: mocks.addKeyRecord,
        updateKeyRecord: mocks.updateKeyRecord,
    },
}));

vi.mock('../../auth/services/authService', () => ({
    AuthService: { encrypt: mocks.encrypt },
}));

vi.mock('../../security/services/securityService', () => ({
    securityService: { getDek: mocks.getDek },
}));

import { createNote, updateNote } from './notesService';

describe('notesService protection flag', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDek.mockResolvedValue('a'.repeat(64));
        mocks.encrypt.mockResolvedValue({ encryptedData: 'cipher', iv: 'iv', tag: 'tag' });
        mocks.addKeyRecord.mockResolvedValue({ recordId: 'record-1' });
        mocks.updateKeyRecord.mockResolvedValue(undefined);
    });

    it('persists requireReauth when creating a protected note', async () => {
        const note = await createNote('user-1', {
            title: 'Private',
            body: 'sensitive body',
            requireReauth: true,
        });

        expect(mocks.encrypt).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Private', requireReauth: true }),
            'a'.repeat(64),
        );
        expect(note.requireReauth).toBe(true);
    });

    it('persists requireReauth when updating a note', async () => {
        await updateNote('user-1', {
            id: 'record-1',
            title: 'Private',
            body: 'sensitive body',
            updatedAt: 1,
            requireReauth: true,
        });

        expect(mocks.encrypt).toHaveBeenCalledWith(
            expect.objectContaining({ requireReauth: true }),
            'a'.repeat(64),
        );
        expect(mocks.updateKeyRecord).toHaveBeenCalledWith('record-1', expect.any(Object));
    });

    it('stores an explicit false when the note is not protected', async () => {
        await createNote('user-1', { title: 'Public', body: 'body' });

        expect(mocks.encrypt).toHaveBeenCalledWith(
            expect.objectContaining({ requireReauth: false }),
            'a'.repeat(64),
        );
    });
});