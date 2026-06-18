import { describe, expect, it } from 'vitest';

import { decryptReducer, initialDecryptState } from './decryptReducer';

describe('decryptReducer', () => {
    it('updates encryptedContent', () => {
        const result = decryptReducer(initialDecryptState, {
            type: 'encryptedContentChanged',
            content: 'encrypted',
        });
        expect(result.encryptedContent).toBe('encrypted');
    });

    it('sets isDecrypting on decryptStarted/decryptFinished', () => {
        const started = decryptReducer(initialDecryptState, { type: 'decryptStarted' });
        expect(started.isDecrypting).toBe(true);

        const finished = decryptReducer(started, { type: 'decryptFinished' });
        expect(finished.isDecrypting).toBe(false);
    });

    it('updates decryptedContent', () => {
        const result = decryptReducer(initialDecryptState, {
            type: 'decryptedContentSet',
            content: 'decrypted-text',
        });
        expect(result.decryptedContent).toBe('decrypted-text');
    });

    it('sets wasSuccessful on markSuccessful', () => {
        const result = decryptReducer(initialDecryptState, { type: 'markSuccessful' });
        expect(result.wasSuccessful).toBe(true);
    });

    it('resetAfterSuccess returns to initial state', () => {
        const modified = {
            ...initialDecryptState,
            encryptedContent: 'old',
            decryptedContent: 'result',
            wasSuccessful: true,
        };
        const result = decryptReducer(modified, { type: 'resetAfterSuccess' });

        expect(result).toEqual({ ...initialDecryptState, encryptedContent: '' });
    });
});
