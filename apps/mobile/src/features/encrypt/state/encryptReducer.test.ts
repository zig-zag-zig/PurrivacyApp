import { describe, expect, it } from 'vitest';

import { encryptReducer, initialEncryptState } from './encryptReducer';

describe('encryptReducer', () => {
    it('updates content on contentChanged', () => {
        const result = encryptReducer(initialEncryptState, {
            type: 'contentChanged',
            content: 'hello',
        });
        expect(result.content).toBe('hello');
    });

    it('sets isEncrypting on encryptStarted/encryptFinished', () => {
        const started = encryptReducer(initialEncryptState, { type: 'encryptStarted' });
        expect(started.isEncrypting).toBe(true);

        const finished = encryptReducer(started, { type: 'encryptFinished' });
        expect(finished.isEncrypting).toBe(false);
    });

    it('updates encryptedContent', () => {
        const result = encryptReducer(initialEncryptState, {
            type: 'encryptedContentChanged',
            encryptedContent: 'encrypted-data',
        });
        expect(result.encryptedContent).toBe('encrypted-data');
    });

    it('sets wasSuccessful on markSuccessful', () => {
        const result = encryptReducer(initialEncryptState, { type: 'markSuccessful' });
        expect(result.wasSuccessful).toBe(true);
    });

    it('resetAfterSuccess preserves completeKeyPairs', () => {
        const keyPairs = [{ fingerprint: 'fp', publicKey: 'pk', privateKey: null, userId: 'u', isDefault: false } as any];
        const state = { ...initialEncryptState, completeKeyPairs: keyPairs, content: 'test', wasSuccessful: true };
        const result = encryptReducer(state, { type: 'resetAfterSuccess' });

        expect(result.completeKeyPairs).toBe(keyPairs);
        expect(result.content).toBe('');
        expect(result.wasSuccessful).toBe(false);
    });
});
