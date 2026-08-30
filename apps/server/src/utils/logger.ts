import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const activeLevel = (LEVEL_WEIGHT[env.logLevel as LogLevel] ? env.logLevel : 'info') as LogLevel;
const SECRET_KEY_RE = /(?:authorization|cookie|token|secret|password|credential|private|mfaCode|refreshToken|accessToken|email|username|uid|userId|userIds|firebaseUid|deviceId|ip|clientIp|sessionId|sessionFamilyId|familyId|recovery|keys|dek|seed|salt|verifier|encrypted|cipher|rateLimitKey)/i;
const serviceName = process.env.LOG_SERVICE_NAME?.trim() || process.env.npm_package_name?.trim() || 'purrivacy-api';

const createRedactor = () => {
    const seen = new WeakSet<object>();

    const redact = (value: unknown): unknown => {
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: env.nodeEnv === 'production' ? undefined : value.stack,
            };
        }

        if (Array.isArray(value)) {
            return value.map(redact);
        }

        if (!value || typeof value !== 'object') {
            return value;
        }

        if (seen.has(value as object)) {
            return '[circular]';
        }

        seen.add(value as object);

        try {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                    key,
                    SECRET_KEY_RE.test(key) ? '[redacted]' : redact(entry),
                ]),
            );
        } finally {
            seen.delete(value as object);
        }
    };

    return redact;
};

const redact = createRedactor();

const shouldLog = (level: LogLevel): boolean => LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[activeLevel];

const safeStringify = (value: unknown): string => {
    try {
        return JSON.stringify(value, (_key, item) => (
            typeof item === 'bigint' ? item.toString() : item
        ));
    } catch (error) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            service: serviceName,
            scope: 'utils.logger',
            message: 'failed to serialize log entry',
            error: redact(error),
        });
    }
};

const write = (scope: string, level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
    if (!shouldLog(level)) {
        return;
    }

    const payload = {
        timestamp: new Date().toISOString(),
        level,
        service: serviceName,
        scope,
        message,
        ...(meta ? redact(meta) as Record<string, unknown> : {}),
    };

    const line = safeStringify(payload);
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
};

export const createLogger = (scope: string) => ({
    debug: (message: string, meta?: Record<string, unknown>) => write(scope, 'debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => write(scope, 'info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => write(scope, 'warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => write(scope, 'error', message, meta),
    child: (childScope: string) => createLogger(`${scope}.${childScope}`),
});
