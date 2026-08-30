import { describe, expect, it, beforeEach } from 'vitest';
import {
    setMfaModalHandler,
    getMfaModalHandler,
    clearMfaModalHandler,
    setRecoveryCodesModalHandler,
    getRecoveryCodesModalHandler,
    clearRecoveryCodesModalHandler,
    setPassphraseStorageConsentHandler,
    getPassphraseStorageConsentHandler,
    clearPassphraseStorageConsentHandler,
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

        it('does not let stale cleanup clear a replacement handler', () => {
            const staleHandler = async () => ({ code: '111111' });
            const liveHandler = async () => ({ code: '222222' });
            setMfaModalHandler(staleHandler);
            setMfaModalHandler(liveHandler);

            clearMfaModalHandler(staleHandler);

            expect(getMfaModalHandler()).toBe(liveHandler);
            clearMfaModalHandler(liveHandler);
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

        it('clears only the matching recovery-code handler', () => {
            const staleHandler = async () => { };
            const liveHandler = async () => { };
            setRecoveryCodesModalHandler(staleHandler);
            setRecoveryCodesModalHandler(liveHandler);
            clearRecoveryCodesModalHandler(staleHandler);
            expect(getRecoveryCodesModalHandler()).toBe(liveHandler);
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

        it('clears only the matching consent handler', () => {
            const staleHandler = async () => true;
            const liveHandler = async () => false;
            setPassphraseStorageConsentHandler(staleHandler);
            setPassphraseStorageConsentHandler(liveHandler);
            clearPassphraseStorageConsentHandler(staleHandler);
            expect(getPassphraseStorageConsentHandler()).toBe(liveHandler);
        });
    });
});
