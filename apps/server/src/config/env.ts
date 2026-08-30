import dotenv from 'dotenv';
import {
    DEFAULT_MAX_KEYS_PER_USER,
    MAX_KEYS_PER_USER,
} from '../core/constants';
import {
    DEFAULT_REQUEST_FORM_LIMIT,
    DEFAULT_REQUEST_JSON_LIMIT,
    MAX_REQUEST_FORM_LIMIT_BYTES,
    MAX_REQUEST_JSON_LIMIT_BYTES,
    HEX_64_RE,
    assertDistinctSecrets,
    getRequiredEnv,
    parseAuthEmailDomain,
    parseBodyLimitEnv,
    parseBooleanEnv,
    parseBoundedNumberEnv,
    parseCsvEnv,
    parseFloatEnv,
    parseNumberEnv,
    parseOptionalStringEnv,
    parseRateLimitStoreSelection,
    parseRecoveryPepperEnv,
    parseTrustProxy,
    validateProductionEnvironment,
} from './envParsers';

dotenv.config();

const warn = (message: string): void => {
    console.warn(`[env] ${message}`);
};

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const isProduction = nodeEnv === 'production';
const isTestEnv = nodeEnv === 'test';
const environment = { isProduction, isTestEnv };

/**
 * MFA_KEK — required everywhere, strictly validated as 64 hex characters in
 * production so a typo cannot silently weaken AES key derivation (API-SEC-007).
 */
const mfaKek = (() => {
    const value = getRequiredEnv('MFA_KEK');
    if (HEX_64_RE.test(value)) {
        return value;
    }
    if (isProduction) {
        throw new Error('[env] MFA_KEK must be exactly 64 hex characters (generate with `openssl rand -hex 32`)');
    }
    if (!isTestEnv) {
        warn('MFA_KEK is not 64 hex characters; this is only acceptable outside production');
    }
    return value;
})();

const firebaseServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const firebaseCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const firebaseDatabaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
const trustProxyRaw = process.env.TRUST_PROXY?.trim();
const firebaseUseEmulator = parseBooleanEnv('FIREBASE_USE_EMULATOR');
const sentryEnabled = parseBooleanEnv('SENTRY_ENABLED', true);
const sentryDsn = parseOptionalStringEnv('SENTRY_DSN');

const jsonBodyLimit = parseBodyLimitEnv('REQUEST_JSON_LIMIT', DEFAULT_REQUEST_JSON_LIMIT, MAX_REQUEST_JSON_LIMIT_BYTES, environment, warn);
const formBodyLimit = parseBodyLimitEnv('REQUEST_FORM_LIMIT', DEFAULT_REQUEST_FORM_LIMIT, MAX_REQUEST_FORM_LIMIT_BYTES, environment, warn);

const recoveryEnumerationPepper = parseRecoveryPepperEnv('RECOVERY_ENUMERATION_PEPPER', 'recovery-enumeration', mfaKek, environment, warn);
const recoveryVerifierPepper = parseRecoveryPepperEnv('RECOVERY_VERIFIER_PEPPER', 'recovery-verifier', mfaKek, environment, warn);

assertDistinctSecrets(recoveryEnumerationPepper, 'RECOVERY_ENUMERATION_PEPPER', mfaKek, 'MFA_KEK');
assertDistinctSecrets(recoveryVerifierPepper, 'RECOVERY_VERIFIER_PEPPER', mfaKek, 'MFA_KEK');
assertDistinctSecrets(recoveryVerifierPepper, 'RECOVERY_VERIFIER_PEPPER', recoveryEnumerationPepper, 'RECOVERY_ENUMERATION_PEPPER');

if (isProduction) {
    validateProductionEnvironment({
        firebaseUseEmulator,
        firebaseServiceAccountJson,
        firebaseCredentialsPath,
        firebaseDatabaseUrl,
        trustProxyRaw,
        sentryEnabled,
        sentryDsn,
    });
}

export const env = {
    appEnv: parseOptionalStringEnv('APP_ENV') || nodeEnv,
    nodeEnv,
    logLevel: process.env.LOG_LEVEL?.trim().toLowerCase() || 'info',
    port: parseNumberEnv('PORT', 5000, 1),
    trustProxy: parseTrustProxy(trustProxyRaw),
    allowedOrigins: parseCsvEnv('ALLOWED_ORIGINS'),
    authEmailDomain: parseAuthEmailDomain(getRequiredEnv('AUTH_EMAIL_DOMAIN')),
    firebaseUseEmulator,
    firebaseServiceAccountJson,
    firebaseCredentialsPath,
    firebaseDatabaseUrl,
    mfaKek,
    recoveryEnumerationPepper,
    recoveryVerifierPepper,
    requestJsonLimit: jsonBodyLimit.limit,
    requestJsonLimitBytes: jsonBodyLimit.limitBytes,
    requestFormLimit: formBodyLimit.limit,
    requestFormLimitBytes: formBodyLimit.limitBytes,
    rateLimitStore: parseRateLimitStoreSelection(process.env.RATE_LIMIT_STORE, process.env.REDIS_URL),
    redisUrl: parseOptionalStringEnv('REDIS_URL'),
    rateLimitFailClosed: parseBooleanEnv('RATE_LIMIT_FAIL_CLOSED', isProduction),
    userMaxKeyRecords: parseBoundedNumberEnv('USER_MAX_KEY_RECORDS', DEFAULT_MAX_KEYS_PER_USER, 1, MAX_KEYS_PER_USER),
    sentryDsn,
    sentryEnabled,
    sentryEnvironment: parseOptionalStringEnv('SENTRY_ENVIRONMENT') || parseOptionalStringEnv('APP_ENV') || nodeEnv,
    sentryRelease: parseOptionalStringEnv('SENTRY_RELEASE'),
    sentryTracesSampleRate: parseFloatEnv('SENTRY_TRACES_SAMPLE_RATE', 0, 0, 1),
};
