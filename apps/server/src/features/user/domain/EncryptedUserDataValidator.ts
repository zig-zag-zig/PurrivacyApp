import { SaltedEncryptedPayload, EncryptedPayload, User, UserEncryptedData } from '../../../core/types';
import {
    MAX_DEK_ENCRYPTED_DATA_LENGTH,
    MAX_ENCRYPTED_KEY_DATA_LENGTH,
    MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH,
    MAX_KEYS_PER_USER,
} from '../../../core/constants';
import { BadRequestError } from '../../../utils/errors';

const HEX_RE = /^[0-9a-f]+$/i;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const RECOVERY_VERIFIER_SALT_BYTES = 16;
const RECOVERY_VERIFIER_HASH_BYTES = 32;

function assertRecord(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestError(`${name} must be an object`);
    }

    return value as Record<string, unknown>;
}

function assertString(value: unknown, name: string, maxLength: number): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestError(`${name} must be a non-empty string`);
    }

    if (value.length > maxLength) {
        throw new BadRequestError(`${name} is too large`);
    }

    return value;
}

function assertHex(value: unknown, name: string, expectedBytes: number): string {
    const stringValue = assertString(value, name, expectedBytes * 2);
    if (stringValue.length !== expectedBytes * 2 || !HEX_RE.test(stringValue)) {
        throw new BadRequestError(`${name} has an invalid format`);
    }

    return stringValue;
}

function assertBase64(value: unknown, name: string, maxLength: number): string {
    const stringValue = assertString(value, name, maxLength);
    if (!BASE64_RE.test(stringValue) || stringValue.length % 4 !== 0) {
        throw new BadRequestError(`${name} has an invalid format`);
    }

    return stringValue;
}

function encryptedBaseLength(value: EncryptedPayload): number {
    return value.encryptedData.length + value.iv.length + value.tag.length;
}

function encryptedLength(value: SaltedEncryptedPayload): number {
    return encryptedBaseLength(value) + value.salt.length;
}

export class EncryptedUserDataValidator {
    static sanitizeEncryptedPayload(
        value: unknown,
        name: string,
        maxEncryptedDataLength = MAX_ENCRYPTED_KEY_DATA_LENGTH,
    ): EncryptedPayload {
        const record = assertRecord(value, name);

        return {
            encryptedData: assertBase64(record.encryptedData, `${name}.encryptedData`, maxEncryptedDataLength),
            iv: assertHex(record.iv, `${name}.iv`, 12),
            tag: assertHex(record.tag, `${name}.tag`, 16),
        };
    }

    static sanitizeSaltedEncryptedPayload(value: unknown, name: string): SaltedEncryptedPayload {
        const record = assertRecord(value, name);
        const base = EncryptedUserDataValidator.sanitizeEncryptedPayload(record, name, MAX_DEK_ENCRYPTED_DATA_LENGTH);

        return {
            ...base,
            salt: assertHex(record.salt, `${name}.salt`, 16),
        };
    }

    static sanitizeEncryptedKeyRecord(value: unknown, name = 'key'): EncryptedPayload {
        return EncryptedUserDataValidator.sanitizeEncryptedPayload(value, name, MAX_ENCRYPTED_KEY_DATA_LENGTH);
    }

    static sanitizeEncryptedKeys(value: unknown, maxKeys = MAX_KEYS_PER_USER): EncryptedPayload[] {
        if (!Array.isArray(value)) {
            throw new BadRequestError('keys must be an array');
        }

        if (value.length > maxKeys) {
            throw new BadRequestError('Too many keys');
        }

        const sanitizedKeys = value.map((key, index) => (
            EncryptedUserDataValidator.sanitizeEncryptedPayload(key, `keys[${index}]`, MAX_ENCRYPTED_KEY_DATA_LENGTH)
        ));

        const totalLength = sanitizedKeys.reduce(
            (total, key) => total + encryptedBaseLength(key),
            0,
        );
        if (totalLength > MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH) {
            throw new BadRequestError('Encrypted keys payload is too large');
        }

        return sanitizedKeys;
    }

    static sanitizeUserEncryptedData(value: unknown, maxKeys = MAX_KEYS_PER_USER): UserEncryptedData {
        const record = assertRecord(value, 'userData');
        const dekPassword = EncryptedUserDataValidator.sanitizeSaltedEncryptedPayload(record.dekPassword, 'dekPassword');
        const dekSeed = EncryptedUserDataValidator.sanitizeSaltedEncryptedPayload(record.dekSeed, 'dekSeed');
        const keys = EncryptedUserDataValidator.sanitizeEncryptedKeys(record.keys, maxKeys);

        if (
            encryptedLength(dekPassword)
            + encryptedLength(dekSeed)
            + keys.reduce((total, key) => total + encryptedBaseLength(key), 0)
            > MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH + (MAX_DEK_ENCRYPTED_DATA_LENGTH * 2)
        ) {
            throw new BadRequestError('User encrypted payload is too large');
        }

        return { dekPassword, dekSeed, keys };
    }

    static sanitizeUserForCreate(value: unknown, maxKeys = MAX_KEYS_PER_USER): User {
        const record = assertRecord(value, 'userData');
        return {
            ...EncryptedUserDataValidator.sanitizeUserEncryptedData(record, maxKeys),
            recoveryVerifierSalt: assertHex(record.recoveryVerifierSalt, 'recoveryVerifierSalt', RECOVERY_VERIFIER_SALT_BYTES),
            recoveryVerifierHash: assertHex(record.recoveryVerifierHash, 'recoveryVerifierHash', RECOVERY_VERIFIER_HASH_BYTES),
            mfaEnabled: false,
        };
    }
}
