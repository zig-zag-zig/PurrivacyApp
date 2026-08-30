import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Pure environment parsing and validation helpers (API-SEC-007).
 *
 * This module has NO side effects and does not read process.env implicitly:
 * every value-taking parser accepts an explicit `source` (defaulting to
 * process.env) and every cross-field/validation helper receives its inputs as
 * arguments, so each function is directly unit-testable without module reloads
 * or process.env mutation.
 */

export const HEX_64_RE = /^[0-9a-f]{64}$/i;
const BYTE_SIZE_RE = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i;
export const DEFAULT_REQUEST_JSON_LIMIT = '10mb';
export const DEFAULT_REQUEST_FORM_LIMIT = '1mb';
export const MAX_REQUEST_JSON_LIMIT_BYTES = 15 * 1024 * 1024;
export const MAX_REQUEST_FORM_LIMIT_BYTES = 2 * 1024 * 1024;

type EnvSource = Record<string, string | undefined>;

export const getRequiredEnv = (name: string, source: EnvSource = process.env): string => {
    const value = source[name]?.trim();
    if (!value) {
        throw new Error(`[env] Missing required environment variable: ${name}`);
    }
    return value;
};

export const parseNumberEnv = (name: string, fallback: number, min = 0, source: EnvSource = process.env): number => {
    const value = source[name]?.trim();
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }

    return parsed;
};

export const parseBoundedNumberEnv = (name: string, fallback: number, min: number, max: number, source: EnvSource = process.env): number => {
    const value = source[name]?.trim();
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }

    return Math.min(parsed, max);
};

export const parseCsvEnv = (name: string, source: EnvSource = process.env): string[] => (
    source[name] || ''
).split(',').map(value => value.trim()).filter(Boolean);

export const parseBooleanEnv = (name: string, fallback = false, source: EnvSource = process.env): boolean => {
    const value = source[name]?.trim().toLowerCase();
    if (!value) {
        return fallback;
    }

    return value === 'true' || value === '1' || value === 'yes';
};

/**
 * Precise Express `trust proxy` configuration (API-SEC-009).
 *
 * Accepted values:
 * - `true` / `false` (legacy booleans)
 * - `loopback` (trust only the loopback subnet — the documented single-tunnel topology)
 * - a hop count, e.g. `1`
 * - a comma-separated list of trusted subnets/IPs, e.g. `10.0.0.0/8, 127.0.0.1`
 */
export const parseTrustProxy = (value: string | undefined): boolean | number | string | string[] => {
    const raw = value?.trim();
    if (!raw) {
        return false;
    }

    const lower = raw.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
        return false;
    }
    if (lower === 'loopback') {
        return 'loopback';
    }
    if (/^\d+$/.test(raw)) {
        const hops = Number.parseInt(raw, 10);
        if (Number.isFinite(hops) && hops >= 0) {
            return hops;
        }
    }

    const TRUSTED_SUBNET_RE = /^(?:loopback|linklocal|uniquelocal|[0-9a-f:.]+(?:\/\d{1,3})?)$/i;
    const subnets = raw.split(',').map(part => part.trim()).filter(Boolean);
    if (subnets.length > 0 && subnets.every(part => TRUSTED_SUBNET_RE.test(part))) {
        return subnets;
    }

    return false;
};

export const parseFloatEnv = (name: string, fallback: number, min = 0, max = 1, source: EnvSource = process.env): number => {
    const value = source[name]?.trim();
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return fallback;
    }

    return parsed;
};

export const parseOptionalStringEnv = (name: string, source: EnvSource = process.env): string | undefined => {
    const value = source[name]?.trim();
    return value || undefined;
};

export const parseAuthEmailDomain = (value: string): string => {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
        throw new Error('[env] AUTH_EMAIL_DOMAIN must be a valid domain');
    }
    return normalized;
};

const parseRateLimitStore = (value: string | undefined): 'memory' | 'redis' => {
    return value?.trim().toLowerCase() === 'redis' ? 'redis' : 'memory';
};

/**
 * Selecting the shared Redis store requires an explicit REDIS_URL: refusing
 * to start beats silently defaulting to a local Redis instance and surfacing
 * the misconfiguration as 503s on the first request (quality review HQ-01).
 */
export const parseRateLimitStoreSelection = (
    storeValue: string | undefined,
    redisUrlValue: string | undefined,
): 'memory' | 'redis' => {
    const store = parseRateLimitStore(storeValue);
    if (store === 'redis' && !redisUrlValue?.trim()) {
        throw new Error('[env] RATE_LIMIT_STORE=redis requires REDIS_URL to be set');
    }
    return store;
};

export const parseByteSizeToBytes = (raw: string): number => {
    const match = BYTE_SIZE_RE.exec(raw);
    if (!match) {
        return Number.NaN;
    }

    const unit = (match[2] || 'b').toLowerCase();
    const multiplier = unit === 'gb'
        ? 1024 * 1024 * 1024
        : unit === 'mb'
            ? 1024 * 1024
            : unit === 'kb'
                ? 1024
                : 1;
    return Math.round(Number.parseFloat(match[1]) * multiplier);
};

/**
 * Parse a byte-size body limit (e.g. `10mb`, `512kb`). Outside production an
 * invalid or oversized value falls back to the default; in production it fails
 * startup (API-SEC-007).
 */
export const parseBodyLimitEnv = (
    name: string,
    fallback: string,
    maxBytes: number,
    environment: { isProduction: boolean; isTestEnv: boolean },
    warn: (message: string) => void,
    source: EnvSource = process.env,
): { limit: string; limitBytes: number } => {
    const fallbackBytes = parseByteSizeToBytes(fallback);
    const raw = source[name]?.trim();
    if (!raw) {
        return { limit: fallback, limitBytes: fallbackBytes };
    }

    const bytes = parseByteSizeToBytes(raw);
    if (!Number.isFinite(bytes)) {
        if (environment.isProduction) {
            throw new Error(`[env] ${name} must be a byte size such as '10mb', got '${raw}'`);
        }
        if (!environment.isTestEnv) {
            warn(`${name} '${raw}' is not a valid byte size; using default '${fallback}'`);
        }
        return { limit: fallback, limitBytes: fallbackBytes };
    }

    if (bytes > maxBytes) {
        if (environment.isProduction) {
            throw new Error(`[env] ${name} must not exceed ${maxBytes / (1024 * 1024)}mb in production, got '${raw}'`);
        }
        if (!environment.isTestEnv) {
            warn(`${name} '${raw}' exceeds the ${maxBytes / (1024 * 1024)}mb maximum; using default '${fallback}'`);
        }
        return { limit: fallback, limitBytes: fallbackBytes };
    }

    return { limit: raw, limitBytes: bytes };
};

/**
 * Recovery pepper secrets. Required (64 hex, distinct from MFA_KEK and each
 * other) in production; outside production an unset pepper is replaced by a
 * stable derived development value (API-SEC-004, API-SEC-010).
 */
export const parseRecoveryPepperEnv = (
    name: string,
    domainSeparator: string,
    kek: string,
    environment: { isProduction: boolean; isTestEnv: boolean },
    warn: (message: string) => void,
    source: EnvSource = process.env,
): string => {
    const value = source[name]?.trim();
    if (value) {
        if (!HEX_64_RE.test(value)) {
            if (environment.isProduction) {
                throw new Error(`[env] ${name} must be exactly 64 hex characters (generate with \`openssl rand -hex 32\`)`);
            }
            if (!environment.isTestEnv) {
                warn(`${name} is not 64 hex characters; this is only acceptable outside production`);
            }
        }
        return value;
    }

    if (environment.isProduction) {
        throw new Error(`[env] Missing required environment variable: ${name}`);
    }
    if (!environment.isTestEnv) {
        warn(`${name} is not set; using a derived development value`);
    }
    return crypto.createHash('sha256').update(`dev:${domainSeparator}:${kek}`).digest('hex');
};

export const assertDistinctSecrets = (first: string, firstName: string, second: string, secondName: string): void => {
    if (first === second) {
        throw new Error(`[env] ${firstName} must be distinct from ${secondName}`);
    }
};

/**
 * Fail-fast production configuration invariants (API-SEC-007).
 */
export const validateProductionEnvironment = (config: {
    firebaseUseEmulator: boolean;
    firebaseServiceAccountJson: string | undefined;
    firebaseCredentialsPath: string | undefined;
    firebaseDatabaseUrl: string | undefined;
    trustProxyRaw: string | undefined;
    sentryEnabled: boolean;
    sentryDsn: string | undefined;
}): void => {
    if (config.firebaseUseEmulator) {
        throw new Error('[env] FIREBASE_USE_EMULATOR must be disabled in production');
    }

    if (!config.firebaseServiceAccountJson && !config.firebaseCredentialsPath) {
        throw new Error('[env] FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is required in production');
    }
    if (config.firebaseServiceAccountJson) {
        try {
            const parsed = JSON.parse(config.firebaseServiceAccountJson) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object' || !parsed.project_id || !parsed.private_key) {
                throw new Error('invalid service account shape');
            }
        } catch {
            throw new Error('[env] FIREBASE_SERVICE_ACCOUNT_JSON must be valid Firebase service-account JSON in production');
        }
    }
    if (config.firebaseCredentialsPath && !fs.existsSync(config.firebaseCredentialsPath)) {
        throw new Error(`[env] GOOGLE_APPLICATION_CREDENTIALS file does not exist: ${config.firebaseCredentialsPath}`);
    }

    if (!config.firebaseDatabaseUrl) {
        throw new Error('[env] FIREBASE_DATABASE_URL is required in production');
    }

    if (!config.trustProxyRaw) {
        throw new Error('[env] TRUST_PROXY must be explicitly configured in production (e.g. loopback, a hop count, or trusted subnets)');
    }

    if (config.sentryEnabled && !config.sentryDsn) {
        throw new Error('[env] SENTRY_DSN is required when SENTRY_ENABLED is true in production');
    }
};
