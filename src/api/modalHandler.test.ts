import { describe, expect, it, beforeEach } from 'vitest';
import {
    setMfaModalHandler,
    getMfaModalHandler,
    setRecoveryCodesModalHandler,
    getRecoveryCodesModalHandler,
    setPassphraseStorageConsentHandler,
    getPassphraseStorageConsentHandler,
} from './modalHandler';

// The module keeps state across tests — reset between each describe block
// by re-importing or using the setter functions directly.

describe('modalHandler', () => {
    beforeEach(() => {
        setMfaModalHandler(null);
        setRecoveryCodesModalHandler(null);
        setPassphraseStorageConsentHandler(null);
    });

    describe('MFA modal handler', () => {
        it('returns null when no handler is set', () => {
            expect(getMfaModalHandler()).toBeNull();
        });

        it('returns the handler after being set', () => {
            const handler = async () => ({ code: '123' });
            setMfaModalHandler(handler);
            expect(getMfaModalHandler()).toBe(handler);
        });

        it('returns null after setting null', () => {
            const handler = async () => ({ code: '123' });
            setMfaModalHandler(handler);
            setMfaModalHandler(null);
            expect(getMfaModalHandler()).toBeNull();
        });
    });

    describe('recovery codes modal handler', () => {
        it('returns null when no handler is set', () => {
            expect(getRecoveryCodesModalHandler()).toBeNull();
        });

        it('returns the handler after being set', () => {
            const handler = async () => { };
            setRecoveryCodesModalHandler(handler);
            expect(getRecoveryCodesModalHandler()).toBe(handler);
        });
    });

    describe('passphrase storage consent handler', () => {
        it('returns null when no handler is set', () => {
            expect(getPassphraseStorageConsentHandler()).toBeNull();
        });

        it('returns the handler after being set', () => {
            const handler = async () => true;
            setPassphraseStorageConsentHandler(handler);
            expect(getPassphraseStorageConsentHandler()).toBe(handler);
        });
    });
});
