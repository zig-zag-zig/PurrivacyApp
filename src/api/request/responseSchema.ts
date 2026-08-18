/**
 * Runtime validation of typed backend response bodies (LANE M).
 *
 * The DTO casts in src/api/** (`as Promise<...>`) are compile-time only; this
 * module is the runtime gate. `validateResponse` runs at the request boundary
 * (`processResponse`) and at the direct-fetch boundary (`userApi`) for every
 * ok response of a typed endpoint, before feature code can read the data.
 *
 * Fail-closed, forward-compatible contract per parser:
 *  - every KNOWN field must be present with the correct primitive (non-empty
 *    strings, booleans, non-negative integer counts, arrays of non-empty
 *    strings); a missing or tampered field rejects with `ApiSchemaError`;
 *  - unknown EXTRA fields are allowed — the backend may add fields without
 *    breaking old clients — and are logged at debug;
 *  - the parsed value is a fresh object containing only known fields, so
 *    feature code never observes unvalidated payload.
 *
 * Style follows updateManifest.ts / errorGuards.ts: explicit imperative
 * field checks, no schema library, no new dependencies.
 */

import { logger } from '../../utils/logger';
import { ApiSchemaError } from '../apiError';
import type {
    EncryptedKeyRecordWithId,
    Encryption,
    EncryptionBase,
    MfaSetupNonceResponse,
    MfaSetupResponse,
    RecoveryChallengeResponse,
    RecoveryCodeRegenerateResponse,
    RecoveryCodeRemainingResponse,
    RecoveryTokenResponse,
    SessionResponse,
    UserEncrypted,
    UserKeyRecordsResponse,
} from '../../types/types';

type Parser = (data: unknown, endpoint: string, method: string) => unknown;

/** Backend `POST /user` (registration) response: `{ success: boolean }`. */
export interface CreateUserResponse {
    success: boolean;
}

// ─── Shared field checks ────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(endpoint: string, method: string, detail: string): never {
    throw new ApiSchemaError(`Invalid ${method} ${endpoint} response: ${detail}`, endpoint, method);
}

const logUnknownFields = (
    raw: Record<string, unknown>,
    endpoint: string,
    method: string,
    knownFields: readonly string[],
): void => {
    for (const key of Object.keys(raw)) {
        if (!knownFields.includes(key)) {
            logger.debug('api response contains unknown field', { endpoint, method, field: key });
        }
    }
};

const asRecord = (value: unknown, endpoint: string, method: string, what?: string): Record<string, unknown> => {
    if (!isRecord(value)) {
        if (what !== undefined) {
            fail(endpoint, method, `field "${what}" must be an object`);
        }
        fail(endpoint, method, 'expected a JSON object');
    }
    return value;
};

const requireString = (raw: Record<string, unknown>, key: string, endpoint: string, method: string): string => {
    const value = raw[key];
    if (typeof value !== 'string' || value.length === 0) {
        fail(endpoint, method, `field "${key}" must be a non-empty string`);
    }
    return value;
};

const requireBoolean = (raw: Record<string, unknown>, key: string, endpoint: string, method: string): boolean => {
    const value = raw[key];
    if (typeof value !== 'boolean') {
        fail(endpoint, method, `field "${key}" must be a boolean`);
    }
    return value;
};

const requireNonNegativeInteger = (
    raw: Record<string, unknown>,
    key: string,
    endpoint: string,
    method: string,
): number => {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        fail(endpoint, method, `field "${key}" must be a non-negative integer`);
    }
    return value;
};

/** Array of non-empty strings; an empty array is allowed (e.g. `keys: []`). */
const requireStringArray = (raw: Record<string, unknown>, key: string, endpoint: string, method: string): string[] => {
    const value = raw[key];
    if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === 'string' && entry.length > 0)) {
        fail(endpoint, method, `field "${key}" must be an array of non-empty strings`);
    }
    return value;
};

// ─── Nested value parsers ───────────────────────────────────────────────────

const ENCRYPTION_BASE_FIELDS = ['encryptedData', 'iv', 'tag'] as const;
const ENCRYPTION_FIELDS = ['encryptedData', 'iv', 'tag', 'salt'] as const;

const parseEncryptionBaseValue = (
    value: unknown,
    endpoint: string,
    method: string,
    what: string,
): EncryptionBase => {
    const raw = asRecord(value, endpoint, method, what);
    const result: EncryptionBase = {
        encryptedData: requireString(raw, 'encryptedData', endpoint, method),
        iv: requireString(raw, 'iv', endpoint, method),
        tag: requireString(raw, 'tag', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ENCRYPTION_BASE_FIELDS);
    return result;
};

const parseEncryptionValue = (value: unknown, endpoint: string, method: string, what: string): Encryption => {
    const raw = asRecord(value, endpoint, method, what);
    const result: Encryption = {
        encryptedData: requireString(raw, 'encryptedData', endpoint, method),
        iv: requireString(raw, 'iv', endpoint, method),
        tag: requireString(raw, 'tag', endpoint, method),
        salt: requireString(raw, 'salt', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ENCRYPTION_FIELDS);
    return result;
};

const parseEncryptedKeyRecordValue = (
    value: unknown,
    endpoint: string,
    method: string,
    what: string,
): EncryptedKeyRecordWithId => {
    const raw = asRecord(value, endpoint, method, what);
    const result: EncryptedKeyRecordWithId = {
        encryptedData: requireString(raw, 'encryptedData', endpoint, method),
        iv: requireString(raw, 'iv', endpoint, method),
        tag: requireString(raw, 'tag', endpoint, method),
        recordId: requireString(raw, 'recordId', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['encryptedData', 'iv', 'tag', 'recordId']);
    return result;
};

// ─── Per-DTO parsers ────────────────────────────────────────────────────────

export function parseRecoveryChallengeResponse(
    data: unknown,
    endpoint: string,
    method: string,
): RecoveryChallengeResponse {
    const raw = asRecord(data, endpoint, method);
    const result: RecoveryChallengeResponse = {
        recoveryVerifierSalt: requireString(raw, 'recoveryVerifierSalt', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['recoveryVerifierSalt']);
    return result;
}

export function parseRecoveryTokenResponse(data: unknown, endpoint: string, method: string): RecoveryTokenResponse {
    const raw = asRecord(data, endpoint, method);
    const userEncrypted = asRecord(raw.userEncrypted, endpoint, method, 'userEncrypted');
    const result: RecoveryTokenResponse = {
        userId: requireString(raw, 'userId', endpoint, method),
        tempToken: requireString(raw, 'tempToken', endpoint, method),
        userEncrypted: {
            dekSeed: parseEncryptionValue(userEncrypted.dekSeed, endpoint, method, 'userEncrypted.dekSeed'),
        },
    };
    logUnknownFields(raw, endpoint, method, ['userId', 'tempToken', 'userEncrypted']);
    logUnknownFields(userEncrypted, endpoint, method, ['dekSeed']);
    return result;
}

export function parseMfaSetupNonceResponse(
    data: unknown,
    endpoint: string,
    method: string,
): MfaSetupNonceResponse {
    const raw = asRecord(data, endpoint, method);
    const result: MfaSetupNonceResponse = {
        nonce: requireString(raw, 'nonce', endpoint, method),
        expiresAt: requireString(raw, 'expiresAt', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['nonce', 'expiresAt']);
    return result;
}

export function parseMfaSetupResponse(data: unknown, endpoint: string, method: string): MfaSetupResponse {
    const raw = asRecord(data, endpoint, method);
    const result: MfaSetupResponse = {
        secret: requireString(raw, 'secret', endpoint, method),
        otpauthUrl: requireString(raw, 'otpauthUrl', endpoint, method),
        recoveryCodes: requireStringArray(raw, 'recoveryCodes', endpoint, method),
        message: requireString(raw, 'message', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['secret', 'otpauthUrl', 'recoveryCodes', 'message']);
    return result;
}

export function parseSessionResponse(data: unknown, endpoint: string, method: string): SessionResponse {
    const raw = asRecord(data, endpoint, method);
    const result: SessionResponse = {
        accessToken: requireString(raw, 'accessToken', endpoint, method),
        refreshToken: requireString(raw, 'refreshToken', endpoint, method),
        accessTokenExpiresAt: requireString(raw, 'accessTokenExpiresAt', endpoint, method),
        refreshTokenExpiresAt: requireString(raw, 'refreshTokenExpiresAt', endpoint, method),
        mfaTrusted: requireBoolean(raw, 'mfaTrusted', endpoint, method),
        mfaEnabled: requireBoolean(raw, 'mfaEnabled', endpoint, method),
    };
    if (raw.newRecoveryCodes !== undefined) {
        result.newRecoveryCodes = requireStringArray(raw, 'newRecoveryCodes', endpoint, method);
    }
    logUnknownFields(raw, endpoint, method, [
        'accessToken',
        'refreshToken',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
        'mfaTrusted',
        'mfaEnabled',
        'newRecoveryCodes',
    ]);
    return result;
}

export function parseMfaTrustResponse(data: unknown, endpoint: string, method: string): { mfaTrusted: boolean } {
    const raw = asRecord(data, endpoint, method);
    const result = {
        mfaTrusted: requireBoolean(raw, 'mfaTrusted', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['mfaTrusted']);
    return result;
}

export function parseRecoveryCodeRegenerateResponse(
    data: unknown,
    endpoint: string,
    method: string,
): RecoveryCodeRegenerateResponse {
    const raw = asRecord(data, endpoint, method);
    const result: RecoveryCodeRegenerateResponse = {
        recoveryCodes: requireStringArray(raw, 'recoveryCodes', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['recoveryCodes']);
    return result;
}

export function parseRecoveryCodeRemainingResponse(
    data: unknown,
    endpoint: string,
    method: string,
): RecoveryCodeRemainingResponse {
    const raw = asRecord(data, endpoint, method);
    const result: RecoveryCodeRemainingResponse = {
        remainingCodes: requireNonNegativeInteger(raw, 'remainingCodes', endpoint, method),
    };
    logUnknownFields(raw, endpoint, method, ['remainingCodes']);
    return result;
}

export function parseCreateUserResponse(
    data: unknown,
    endpoint: string,
    method: string,
): CreateUserResponse {
    const raw = asRecord(data, endpoint, method);
    const success = requireBoolean(raw, 'success', endpoint, method);
    if (success !== true) {
        fail(endpoint, method, 'field "success" must be true (registration did not complete)');
    }
    logUnknownFields(raw, endpoint, method, ['success']);
    return { success };
}

export function parseUserEncrypted(data: unknown, endpoint: string, method: string): UserEncrypted {
    const raw = asRecord(data, endpoint, method);
    const keysRaw = raw.keys;
    if (!Array.isArray(keysRaw)) {
        fail(endpoint, method, 'field "keys" must be an array');
    }

    const result: UserEncrypted = {
        dekPassword: parseEncryptionValue(raw.dekPassword, endpoint, method, 'dekPassword'),
        dekSeed: parseEncryptionValue(raw.dekSeed, endpoint, method, 'dekSeed'),
        keys: keysRaw.map((entry, index) =>
            parseEncryptionBaseValue(entry, endpoint, method, `keys[${index}]`),
        ),
    };
    if (raw.passphraseStorageEnabled !== undefined) {
        result.passphraseStorageEnabled = requireBoolean(raw, 'passphraseStorageEnabled', endpoint, method);
    }
    logUnknownFields(raw, endpoint, method, ['dekPassword', 'dekSeed', 'keys', 'passphraseStorageEnabled']);
    return result;
}

export function parseUserKeyRecordsResponse(data: unknown, endpoint: string, method: string): UserKeyRecordsResponse {
    const raw = asRecord(data, endpoint, method);
    const keysRaw = raw.keys;
    if (!Array.isArray(keysRaw)) {
        fail(endpoint, method, 'field "keys" must be an array');
    }

    const result: UserKeyRecordsResponse = {
        keys: keysRaw.map((entry, index) =>
            parseEncryptedKeyRecordValue(entry, endpoint, method, `keys[${index}]`),
        ),
    };
    logUnknownFields(raw, endpoint, method, ['keys']);
    return result;
}

export function parseEncryptedKeyRecordWithId(
    data: unknown,
    endpoint: string,
    method: string,
): EncryptedKeyRecordWithId {
    return parseEncryptedKeyRecordValue(data, endpoint, method, 'key record');
}

// ─── Endpoint registry ──────────────────────────────────────────────────────

const EXACT_PARSERS: Record<string, Parser> = {
    'POST /auth/recovery/challenge': parseRecoveryChallengeResponse,
    'POST /auth/recovery/token': parseRecoveryTokenResponse,
    'POST /mfa/setup': parseMfaSetupResponse,
    'POST /auth/session/mfa-setup-nonce': parseMfaSetupNonceResponse,
    'POST /mfa/enable': parseSessionResponse,
    'POST /mfa/disable': parseSessionResponse,
    'POST /mfa/session/trust': parseMfaTrustResponse,
    'POST /mfa/recovery-codes/regenerate': parseRecoveryCodeRegenerateResponse,
    'GET /mfa/recovery-codes/remaining': parseRecoveryCodeRemainingResponse,
    'POST /auth/session': parseSessionResponse,
    'POST /auth/session/refresh': parseSessionResponse,
    'POST /user': parseCreateUserResponse,
    'GET /user': parseUserEncrypted,
    'GET /user/key-records': parseUserKeyRecordsResponse,
    'POST /user/key-records': parseEncryptedKeyRecordWithId,
};

const DYNAMIC_PARSERS: ReadonlyArray<{ method: string; pathPrefix: string; parse: Parser }> = [
    // PUT /user/key-records/:recordId — the record id is URL-encoded in the path.
    { method: 'PUT', pathPrefix: '/user/key-records/', parse: parseEncryptedKeyRecordWithId },
];

/**
 * Validates an ok response body for a registered typed endpoint.
 *
 * Returns the validated (picked) object for registered endpoints, or the raw
 * data unchanged for endpoints without a DTO contract (void-style calls whose
 * results are never cast or read). Throws `ApiSchemaError` on missing or
 * malformed known fields.
 */
export function validateResponse(endpoint: string, method: string, data: unknown): unknown {
    const exactParser = EXACT_PARSERS[`${method} ${endpoint}`];
    if (exactParser) {
        return exactParser(data, endpoint, method);
    }

    for (const { method: dynamicMethod, pathPrefix, parse } of DYNAMIC_PARSERS) {
        if (method === dynamicMethod && endpoint.startsWith(pathPrefix) && endpoint.length > pathPrefix.length) {
            return parse(data, endpoint, method);
        }
    }

    return data;
}
