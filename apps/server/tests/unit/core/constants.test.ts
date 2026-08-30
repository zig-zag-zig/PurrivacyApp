import {
    ACCESS_TOKEN_LIFETIME_MS,
    REFRESH_TOKEN_LIFETIME_MS,
    UNTRUSTED_MFA_MAX_AGE_MS,
    SESSION_ID_BYTES,
    RECOVERY_CODE_COUNT,
    MFA_SETUP_EXPIRY_MINUTES,
    AUTO_REGENERATE_THRESHOLD,
    DEFAULT_MAX_KEYS_PER_USER,
    DEFAULT_KEY_RECORDS_PAGE_SIZE,
    MAX_KEYS_PER_USER,
    MAX_KEY_RECORDS_PAGE_SIZE,
    MAX_ENCRYPTED_KEY_DATA_LENGTH,
    MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH,
    MAX_DEK_ENCRYPTED_DATA_LENGTH,
    MAX_PUSH_TOKEN_LENGTH,
} from '../../../src/core/constants';

describe('constants', () => {
    it('ACCESS_TOKEN_LIFETIME_MS is 15 minutes', () => {
        expect(ACCESS_TOKEN_LIFETIME_MS).toBe(15 * 60 * 1000);
    });

    it('REFRESH_TOKEN_LIFETIME_MS is 90 days', () => {
        expect(REFRESH_TOKEN_LIFETIME_MS).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it('UNTRUSTED_MFA_MAX_AGE_MS is 4 hours', () => {
        expect(UNTRUSTED_MFA_MAX_AGE_MS).toBe(4 * 60 * 60 * 1000);
    });

    it('SESSION_ID_BYTES is 32', () => {
        expect(SESSION_ID_BYTES).toBe(32);
    });

    it('RECOVERY_CODE_COUNT is 10', () => {
        expect(RECOVERY_CODE_COUNT).toBe(10);
    });

    it('MFA_SETUP_EXPIRY_MINUTES is 10', () => {
        expect(MFA_SETUP_EXPIRY_MINUTES).toBe(10);
    });

    it('AUTO_REGENERATE_THRESHOLD is 2', () => {
        expect(AUTO_REGENERATE_THRESHOLD).toBe(2);
    });

    it('MAX_KEYS_PER_USER is 5000', () => {
        expect(MAX_KEYS_PER_USER).toBe(5000);
    });

    it('DEFAULT_MAX_KEYS_PER_USER is 1000', () => {
        expect(DEFAULT_MAX_KEYS_PER_USER).toBe(1000);
    });

    it('DEFAULT_KEY_RECORDS_PAGE_SIZE is 200', () => {
        expect(DEFAULT_KEY_RECORDS_PAGE_SIZE).toBe(200);
    });

    it('MAX_KEY_RECORDS_PAGE_SIZE is 500', () => {
        expect(MAX_KEY_RECORDS_PAGE_SIZE).toBe(500);
    });

    it('MAX_ENCRYPTED_KEY_DATA_LENGTH is 1_000_000', () => {
        expect(MAX_ENCRYPTED_KEY_DATA_LENGTH).toBe(1_000_000);
    });

    it('MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH is 8_000_000', () => {
        expect(MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH).toBe(8_000_000);
    });

    it('MAX_DEK_ENCRYPTED_DATA_LENGTH is 512', () => {
        expect(MAX_DEK_ENCRYPTED_DATA_LENGTH).toBe(512);
    });

    it('MAX_PUSH_TOKEN_LENGTH is 512', () => {
        expect(MAX_PUSH_TOKEN_LENGTH).toBe(512);
    });
});
