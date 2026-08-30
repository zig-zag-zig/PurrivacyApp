import { describe, expect, it } from 'vitest';

import {
    normalizeMfaStatePayload,
    parseClearMfaCodePayload,
    parseCloseMfaModalPayload,
    parseNewRecoveryCodesPayload,
    parseNotificationData,
    parsePassphraseDeletedPayload,
    parsePassphraseStorageChangedPayload,
    parsePassphraseSyncedPayload,
} from './notificationEventParsing';

describe('parseNotificationData', () => {
    it('passes through a direct payload object', () => {
        expect(parseNotificationData({ data: { eventName: 'signOut' } }))
            .toEqual({ eventName: 'signOut' });
    });

    it('parses a dataString JSON envelope', () => {
        expect(parseNotificationData({
            data: { dataString: '{"eventName":"mfaState","payload":{"mfaEnabled":true,"mfaTrusted":false}}' },
        })).toEqual({
            eventName: 'mfaState',
            payload: { mfaEnabled: true, mfaTrusted: false },
        });
    });

    it('parses a legacy body JSON envelope', () => {
        expect(parseNotificationData({ data: { body: '{"eventName":"user"}' } }))
            .toEqual({ eventName: 'user' });
    });

    it('falls back to the inner object when dataString is not JSON', () => {
        const inner = { eventName: 'user', payload: 'broken{{' };
        expect(parseNotificationData({ data: { dataString: 'broken{{', ...inner } }))
            .toEqual({ dataString: 'broken{{', eventName: 'user', payload: 'broken{{' });
    });

    it('returns an empty object for missing or non-object data', () => {
        expect(parseNotificationData(undefined)).toEqual({});
        expect(parseNotificationData(null)).toEqual({});
        expect(parseNotificationData('plain-string')).toEqual({});
        expect(parseNotificationData({ data: 'not-an-object' })).toEqual({});
    });

    it('returns the inner object when the parsed JSON is not an object', () => {
        const inner = { payload: 'x' };
        expect(parseNotificationData({ data: { dataString: '"just-a-string"', ...inner } }))
            .toEqual({ dataString: '"just-a-string"', payload: 'x' });
    });
});

describe('parseClearMfaCodePayload', () => {
    it('parses a valid payload', () => {
        expect(parseClearMfaCodePayload({ isWrongMfaCode: true }))
            .toEqual({ isWrongMfaCode: true });
    });

    it('treats absent flag as undefined and drops tampered values', () => {
        expect(parseClearMfaCodePayload({})).toEqual({ isWrongMfaCode: undefined });
        expect(parseClearMfaCodePayload({ isWrongMfaCode: 'yes' })).toEqual({ isWrongMfaCode: undefined });
        expect(parseClearMfaCodePayload('tampered')).toBeUndefined();
        expect(parseClearMfaCodePayload(null)).toBeUndefined();
    });
});

describe('parseCloseMfaModalPayload', () => {
    it('parses valid delayMs and force values', () => {
        expect(parseCloseMfaModalPayload({ delayMs: 500, force: true }))
            .toEqual({ delayMs: 500, force: true });
    });

    it('accepts numeric-string delayMs (push payloads are often stringified)', () => {
        expect(parseCloseMfaModalPayload({ delayMs: '500' }))
            .toEqual({ delayMs: 500, force: undefined });
    });

    it('drops tampered delayMs/force values', () => {
        expect(parseCloseMfaModalPayload({ delayMs: 'abc' })).toEqual({ delayMs: undefined, force: undefined });
        expect(parseCloseMfaModalPayload({ delayMs: {}, force: 1 })).toEqual({ delayMs: undefined, force: undefined });
        expect(parseCloseMfaModalPayload('tampered')).toBeUndefined();
    });
});

describe('normalizeMfaStatePayload', () => {
    it('normalizes a direct mfaState payload', () => {
        expect(normalizeMfaStatePayload({ mfaEnabled: true, mfaTrusted: false }))
            .toEqual({ mfaState: { mfaEnabled: true, mfaTrusted: false }, source: 'remoteNotification' });
    });

    it('accepts a nested payload.mfaState object', () => {
        expect(normalizeMfaStatePayload({ mfaState: { mfaEnabled: false, mfaTrusted: true } }))
            .toEqual({ mfaState: { mfaEnabled: false, mfaTrusted: true }, source: 'remoteNotification' });
    });

    it('rejects payloads with non-boolean flags', () => {
        expect(normalizeMfaStatePayload({ mfaEnabled: 'yes', mfaTrusted: false })).toBeUndefined();
        expect(normalizeMfaStatePayload({ mfaEnabled: true })).toBeUndefined();
        expect(normalizeMfaStatePayload('tampered')).toBeUndefined();
        expect(normalizeMfaStatePayload(null)).toBeUndefined();
    });
});

describe('parseNewRecoveryCodesPayload', () => {
    it('parses a string array', () => {
        expect(parseNewRecoveryCodesPayload({ recoveryCodes: ['a', 'b'] }))
            .toEqual({ recoveryCodes: ['a', 'b'] });
    });

    it('rejects non-arrays and arrays with non-string entries', () => {
        expect(parseNewRecoveryCodesPayload({ recoveryCodes: 'a' })).toBeUndefined();
        expect(parseNewRecoveryCodesPayload({ recoveryCodes: ['a', 5] })).toBeUndefined();
        expect(parseNewRecoveryCodesPayload({})).toBeUndefined();
        expect(parseNewRecoveryCodesPayload(null)).toBeUndefined();
    });
});

describe('passphrase payload guards', () => {
    it('parses passphraseStorageChanged', () => {
        expect(parsePassphraseStorageChangedPayload({ enabled: true })).toEqual({ enabled: true });
        expect(parsePassphraseStorageChangedPayload({ enabled: 'yes' })).toBeUndefined();
        expect(parsePassphraseStorageChangedPayload({})).toBeUndefined();
    });

    it('parses passphraseSynced', () => {
        expect(parsePassphraseSyncedPayload({ fingerprint: 'fp', passphrase: 'pp' }))
            .toEqual({ fingerprint: 'fp', passphrase: 'pp' });
        expect(parsePassphraseSyncedPayload({ fingerprint: 'fp' })).toBeUndefined();
        expect(parsePassphraseSyncedPayload({ fingerprint: 'fp', passphrase: 5 })).toBeUndefined();
        expect(parsePassphraseSyncedPayload({})).toBeUndefined();
    });

    it('parses passphraseDeleted', () => {
        expect(parsePassphraseDeletedPayload({ fingerprint: 'fp' })).toEqual({ fingerprint: 'fp' });
        expect(parsePassphraseDeletedPayload({ fingerprint: 5 })).toBeUndefined();
        expect(parsePassphraseDeletedPayload({})).toBeUndefined();
        expect(parsePassphraseDeletedPayload(null)).toBeUndefined();
    });
});
