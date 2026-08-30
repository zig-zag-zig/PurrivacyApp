/**
 * Application constants
 */

// Session constants
export const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, extended on rotation
export const UNTRUSTED_MFA_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
export const SESSION_ID_BYTES = 32;

// MFA constants
export const RECOVERY_CODE_COUNT = 10;
export const MFA_SETUP_EXPIRY_MINUTES = 10;
export const AUTO_REGENERATE_THRESHOLD = 2;

// Firestore/RTDB abuse guards for user-controlled stored data.
// Keys are stored as separate RTDB children, but the public API still moves the
// full encrypted key array in one request/response.
export const MAX_KEYS_PER_USER = 5_000; // Hard ceiling; the effective quota is env-configurable (USER_MAX_KEY_RECORDS).
export const DEFAULT_MAX_KEYS_PER_USER = 1_000;
export const MAX_ENCRYPTED_KEY_DATA_LENGTH = 1_000_000;
export const MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH = 8_000_000;
export const MAX_DEK_ENCRYPTED_DATA_LENGTH = 512;
export const MAX_PUSH_TOKEN_LENGTH = 512;

// Key-record list pagination (API-SEC-011).
export const DEFAULT_KEY_RECORDS_PAGE_SIZE = 200;
export const MAX_KEY_RECORDS_PAGE_SIZE = 500;
