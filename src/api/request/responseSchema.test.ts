import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({ debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() }));

vi.mock('../../utils/logger', () => ({
    logger: mockLogger,
}));

import { ApiSchemaError } from '../apiError';
import {
    parseCreateUserResponse,
    parseEncryptedKeyRecordWithId,
    parseMfaSetupResponse,
    parseMfaTrustResponse,
    parseRecoveryChallengeResponse,
    parseRecoveryCodeRegenerateResponse,
    parseRecoveryCodeRemainingResponse,
    parseRecoveryTokenResponse,
    parseSessionResponse,
    parseUserEncrypted,
    parseUserKeyRecordsResponse,
    validateResponse,
} from './responseSchema';

const ENDPOINT = '/some/endpoint';
const METHOD = 'POST';

const expectSchemaError = (promise: Promise<unknown>, fieldPart: string): Promise<void> =>
    expect(promise).rejects.toMatchObject({
        name: 'ApiSchemaError',
        endpoint: ENDPOINT,
        method: METHOD,
        message: expect.stringContaining(fieldPart),
    });

const expectSchemaErrorInstance = (promise: Promise<unknown>): Promise<void> =>
    expect(promise).rejects.toBeInstanceOf(ApiSchemaError);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('parseRecoveryChallengeResponse', () => {
    it('accepts a minimal valid response', async () => {
        const result = parseRecoveryChallengeResponse(
            { recoveryVerifierSalt: 'salt-value' },
            ENDPOINT,
            METHOD,
        );
        expect(result).toEqual({ recoveryVerifierSalt: 'salt-value' });
    });

    it('rejects a missing field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryChallengeResponse({}, ENDPOINT, METHOD)),
            'recoveryVerifierSalt',
        );
    });

    it('rejects a tampered (non-string) field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryChallengeResponse(
                { recoveryVerifierSalt: 42 },
                ENDPOINT,
                METHOD,
            )),
            'recoveryVerifierSalt',
        );
    });

    it('allows unknown extra fields and logs them at debug', () => {
        const result = parseRecoveryChallengeResponse(
            { recoveryVerifierSalt: 'salt-value', futureField: 'x' },
            ENDPOINT,
            METHOD,
        );
        expect(result).toEqual({ recoveryVerifierSalt: 'salt-value' });
        expect(mockLogger.debug).toHaveBeenCalledWith(
            'api response contains unknown field',
            expect.objectContaining({ field: 'futureField', endpoint: ENDPOINT }),
        );
    });

    it('rejects a non-object body (array)', async () => {
        await expectSchemaErrorInstance(
            Promise.resolve().then(() => parseRecoveryChallengeResponse(['salt'], ENDPOINT, METHOD)),
        );
    });
});

describe('parseRecoveryTokenResponse', () => {
    const valid = {
        userId: 'user-1',
        tempToken: 'temp-token',
        userEncrypted: {
            dekSeed: { encryptedData: 'ed', iv: 'iv', tag: 'tag', salt: 'salt' },
        },
    };

    it('accepts a valid response', () => {
        expect(parseRecoveryTokenResponse(valid, ENDPOINT, METHOD)).toEqual(valid);
    });

    it('rejects a missing top-level field', async () => {
        const { userId, ...missing } = valid;
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryTokenResponse(missing, ENDPOINT, METHOD)),
            'userId',
        );
    });

    it('rejects a tampered nested userEncrypted.dekSeed', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryTokenResponse(
                { ...valid, userEncrypted: { dekSeed: { encryptedData: 'ed' } } },
                ENDPOINT,
                METHOD,
            )),
            'iv',
        );
    });

    it('rejects a missing nested userEncrypted.dekSeed', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryTokenResponse(
                { ...valid, userEncrypted: {} },
                ENDPOINT,
                METHOD,
            )),
            'userEncrypted.dekSeed',
        );
    });

    it('rejects a tampered nested non-object userEncrypted', async () => {
        await expectSchemaErrorInstance(
            Promise.resolve().then(() => parseRecoveryTokenResponse(
                { ...valid, userEncrypted: 'nope' },
                ENDPOINT,
                METHOD,
            )),
        );
    });
});

describe('parseMfaSetupResponse', () => {
    const valid = {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/Purrivacy:user?secret=...',
        recoveryCodes: ['code-1', 'code-2'],
        message: 'Store these codes',
    };

    it('accepts a valid response', () => {
        expect(parseMfaSetupResponse(valid, ENDPOINT, METHOD)).toEqual(valid);
    });

    it('rejects a missing field', async () => {
        const { recoveryCodes, ...missing } = valid;
        await expectSchemaError(
            Promise.resolve().then(() => parseMfaSetupResponse(missing, ENDPOINT, METHOD)),
            'recoveryCodes',
        );
    });

    it('rejects a tampered recoveryCodes entry', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseMfaSetupResponse(
                { ...valid, recoveryCodes: ['code-1', 7] },
                ENDPOINT,
                METHOD,
            )),
            'recoveryCodes',
        );
    });

    it('accepts an empty recoveryCodes array', () => {
        expect(parseMfaSetupResponse({ ...valid, recoveryCodes: [] }, ENDPOINT, METHOD))
            .toEqual({ ...valid, recoveryCodes: [] });
    });
});

describe('parseSessionResponse', () => {
    const valid = {
        accessToken: 'at',
        refreshToken: 'rt',
        accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
        refreshTokenExpiresAt: '2026-01-02T00:00:00.000Z',
        mfaTrusted: false,
        mfaEnabled: true,
    };

    it('accepts a valid response', () => {
        expect(parseSessionResponse(valid, ENDPOINT, METHOD)).toEqual(valid);
    });

    it('accepts a response without the optional newRecoveryCodes', () => {
        expect(parseSessionResponse(valid, ENDPOINT, METHOD)).not.toHaveProperty('newRecoveryCodes');
    });

    it('accepts a validated optional newRecoveryCodes', () => {
        const result = parseSessionResponse({ ...valid, newRecoveryCodes: ['c1'] }, ENDPOINT, METHOD);
        expect(result.newRecoveryCodes).toEqual(['c1']);
    });

    it('rejects a missing required field', async () => {
        const { accessToken, ...missing } = valid;
        await expectSchemaError(
            Promise.resolve().then(() => parseSessionResponse(missing, ENDPOINT, METHOD)),
            'accessToken',
        );
    });

    it('rejects a tampered boolean field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseSessionResponse({ ...valid, mfaTrusted: 'yes' }, ENDPOINT, METHOD)),
            'mfaTrusted',
        );
    });

    it('rejects a tampered optional newRecoveryCodes', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseSessionResponse(
                { ...valid, newRecoveryCodes: [1, 2] },
                ENDPOINT,
                METHOD,
            )),
            'newRecoveryCodes',
        );
    });

    it('rejects a top-level non-object body', async () => {
        await expectSchemaErrorInstance(
            Promise.resolve().then(() => parseSessionResponse(null, ENDPOINT, METHOD)),
        );
    });
});

describe('parseMfaTrustResponse', () => {
    it('accepts a valid response', () => {
        expect(parseMfaTrustResponse({ mfaTrusted: true }, ENDPOINT, METHOD))
            .toEqual({ mfaTrusted: true });
    });

    it('rejects a missing field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseMfaTrustResponse({}, ENDPOINT, METHOD)),
            'mfaTrusted',
        );
    });

    it('rejects a tampered field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseMfaTrustResponse({ mfaTrusted: 1 }, ENDPOINT, METHOD)),
            'mfaTrusted',
        );
    });
});

describe('parseRecoveryCodeRegenerateResponse', () => {
    it('accepts a valid response', () => {
        expect(parseRecoveryCodeRegenerateResponse({ recoveryCodes: ['a', 'b'] }, ENDPOINT, METHOD))
            .toEqual({ recoveryCodes: ['a', 'b'] });
    });

    it('rejects a missing field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryCodeRegenerateResponse({}, ENDPOINT, METHOD)),
            'recoveryCodes',
        );
    });

    it('rejects a tampered field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryCodeRegenerateResponse(
                { recoveryCodes: 'a,b' },
                ENDPOINT,
                METHOD,
            )),
            'recoveryCodes',
        );
    });
});

describe('parseRecoveryCodeRemainingResponse', () => {
    it('accepts a valid response including zero', () => {
        expect(parseRecoveryCodeRemainingResponse({ remainingCodes: 0 }, ENDPOINT, METHOD))
            .toEqual({ remainingCodes: 0 });
        expect(parseRecoveryCodeRemainingResponse({ remainingCodes: 5 }, ENDPOINT, METHOD))
            .toEqual({ remainingCodes: 5 });
    });

    it('rejects a missing field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryCodeRemainingResponse({}, ENDPOINT, METHOD)),
            'remainingCodes',
        );
    });

    it('rejects a tampered (non-integer or negative) field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryCodeRemainingResponse(
                { remainingCodes: 2.5 },
                ENDPOINT,
                METHOD,
            )),
            'remainingCodes',
        );
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryCodeRemainingResponse(
                { remainingCodes: -1 },
                ENDPOINT,
                METHOD,
            )),
            'remainingCodes',
        );
        await expectSchemaError(
            Promise.resolve().then(() => parseRecoveryCodeRemainingResponse(
                { remainingCodes: '5' },
                ENDPOINT,
                METHOD,
            )),
            'remainingCodes',
        );
    });
});

describe('parseCreateUserResponse', () => {
    it('accepts a successful registration response', () => {
        expect(parseCreateUserResponse({ success: true }, ENDPOINT, METHOD)).toEqual({ success: true });
    });

    it('rejects success: false (registration did not complete)', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseCreateUserResponse({ success: false }, ENDPOINT, METHOD)),
            'success',
        );
    });

    it('rejects a missing success field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseCreateUserResponse({}, ENDPOINT, METHOD)),
            'success',
        );
    });

    it('rejects a non-object body', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseCreateUserResponse('nope', ENDPOINT, METHOD)),
            '',
        );
    });
});

describe('parseUserEncrypted', () => {
    const valid = {
        dekPassword: { encryptedData: 'ed1', iv: 'iv1', tag: 'tag1', salt: 'salt1' },
        dekSeed: { encryptedData: 'ed2', iv: 'iv2', tag: 'tag2', salt: 'salt2' },
        keys: [
            { encryptedData: 'ed3', iv: 'iv3', tag: 'tag3' },
            { encryptedData: 'ed4', iv: 'iv4', tag: 'tag4' },
        ],
    };

    it('accepts a valid response with key records', () => {
        expect(parseUserEncrypted(valid, ENDPOINT, METHOD)).toEqual(valid);
    });

    it('accepts an empty keys array (fresh registration)', () => {
        expect(parseUserEncrypted({ ...valid, keys: [] }, ENDPOINT, METHOD))
            .toEqual({ ...valid, keys: [] });
    });

    it('accepts an optional boolean passphraseStorageEnabled', () => {
        expect(parseUserEncrypted({ ...valid, passphraseStorageEnabled: true }, ENDPOINT, METHOD))
            .toEqual({ ...valid, passphraseStorageEnabled: true });
    });

    it('rejects a tampered passphraseStorageEnabled', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseUserEncrypted(
                { ...valid, passphraseStorageEnabled: 'yes' },
                ENDPOINT,
                METHOD,
            )),
            'passphraseStorageEnabled',
        );
    });

    it('rejects a non-array keys field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseUserEncrypted({ ...valid, keys: 'nope' }, ENDPOINT, METHOD)),
            'keys',
        );
    });

    it('rejects a tampered nested key record', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseUserEncrypted(
                { ...valid, keys: [{ encryptedData: 'ed3', iv: 'iv3' }] },
                ENDPOINT,
                METHOD,
            )),
            'tag',
        );
    });

    it('rejects a missing dekSeed', async () => {
        const { dekSeed, ...missing } = valid;
        await expectSchemaError(
            Promise.resolve().then(() => parseUserEncrypted(missing, ENDPOINT, METHOD)),
            'dekSeed',
        );
    });
});

describe('parseUserKeyRecordsResponse', () => {
    const valid = {
        keys: [
            { encryptedData: 'ed', iv: 'iv', tag: 'tag', recordId: 'rec-1' },
        ],
    };

    it('accepts a valid response', () => {
        expect(parseUserKeyRecordsResponse(valid, ENDPOINT, METHOD)).toEqual(valid);
    });

    it('accepts an empty keys array', () => {
        expect(parseUserKeyRecordsResponse({ keys: [] }, ENDPOINT, METHOD)).toEqual({ keys: [] });
    });

    it('rejects a missing recordId in an entry', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseUserKeyRecordsResponse(
                { keys: [{ encryptedData: 'ed', iv: 'iv', tag: 'tag' }] },
                ENDPOINT,
                METHOD,
            )),
            'recordId',
        );
    });

    it('rejects a missing keys field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseUserKeyRecordsResponse({}, ENDPOINT, METHOD)),
            'keys',
        );
    });
});

describe('parseEncryptedKeyRecordWithId', () => {
    const valid = { encryptedData: 'ed', iv: 'iv', tag: 'tag', recordId: 'rec-1' };

    it('accepts a valid record', () => {
        expect(parseEncryptedKeyRecordWithId(valid, ENDPOINT, METHOD)).toEqual(valid);
    });

    it('rejects a missing recordId', async () => {
        const { recordId, ...missing } = valid;
        await expectSchemaError(
            Promise.resolve().then(() => parseEncryptedKeyRecordWithId(missing, ENDPOINT, METHOD)),
            'recordId',
        );
    });

    it('rejects a tampered field', async () => {
        await expectSchemaError(
            Promise.resolve().then(() => parseEncryptedKeyRecordWithId(
                { ...valid, encryptedData: 7 },
                ENDPOINT,
                METHOD,
            )),
            'encryptedData',
        );
    });
});

describe('validateResponse registry', () => {
    const validSession = {
        accessToken: 'at',
        refreshToken: 'rt',
        accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
        refreshTokenExpiresAt: '2026-01-02T00:00:00.000Z',
        mfaTrusted: false,
        mfaEnabled: true,
    };
    const validKeyRecord = { encryptedData: 'ed', iv: 'iv', tag: 'tag', recordId: 'rec-1' };

    it('validates exact-match endpoints', () => {
        expect(validateResponse('/auth/recovery/challenge', 'POST', { recoveryVerifierSalt: 's' }))
            .toEqual({ recoveryVerifierSalt: 's' });
        expect(validateResponse('/auth/session', 'POST', validSession)).toEqual(validSession);
        expect(validateResponse('/user', 'GET', {
            dekPassword: { encryptedData: 'a', iv: 'b', tag: 'c', salt: 'd' },
            dekSeed: { encryptedData: 'e', iv: 'f', tag: 'g', salt: 'h' },
            keys: [],
        })).toMatchObject({ keys: [] });
    });

    it('matches dynamic PUT /user/key-records/:recordId endpoints', () => {
        expect(validateResponse('/user/key-records/rec-123', 'PUT', validKeyRecord))
            .toEqual(validKeyRecord);
    });

    it('does not match the bare prefix without a record id', () => {
        const raw = { unexpected: true };
        expect(validateResponse('/user/key-records/', 'PUT', raw)).toBe(raw);
    });

    it('passes through endpoints without a DTO contract unchanged', () => {
        const raw = { anything: [1, 2, 3] };
        expect(validateResponse('/auth/revoke-all-sessions', 'POST', raw)).toBe(raw);
        expect(validateResponse('/user/change-password', 'POST', raw)).toBe(raw);
        expect(validateResponse('/test', 'GET', raw)).toBe(raw);
    });

    it('rejects a malformed body for a registered endpoint', async () => {
        await expectSchemaErrorInstance(
            Promise.resolve().then(() => validateResponse('/user/key-records', 'GET', { keys: 'nope' })),
        );
    });

    it('rejects a malformed body for a dynamic endpoint', async () => {
        await expectSchemaErrorInstance(
            Promise.resolve().then(() => validateResponse('/user/key-records/rec-1', 'PUT', { recordId: 'rec-1' })),
        );
    });
});
