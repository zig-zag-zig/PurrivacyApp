type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SECRET_KEY_RE = /(token|secret|password|passphrase|authorization|credential|private|mfaCode|refreshToken|accessToken|seed|dek|plaintext|clearText)/i;
const EXPO_MANIFEST_KEYS = ['id', 'createdAt', 'runtimeVersion', 'launchAsset'];

const isDevRuntime = (): boolean => (
    typeof __DEV__ !== 'undefined'
        ? __DEV__
        : process.env.NODE_ENV !== 'production'
);

const isExpoLaunchManifest = (value: Record<string, unknown>): boolean => (
    EXPO_MANIFEST_KEYS.every(key => key in value)
);

const safeStringify = (value: unknown): string => {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return '[unserializable log metadata]';
    }
};

export const redact = (value: unknown): unknown => {
    if (value instanceof Error) {
        const customProperties = Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                SECRET_KEY_RE.test(key) ? '[redacted]' : redact(entry),
            ]),
        );

        return {
            name: value.name,
            message: value.message,
            stack: isDevRuntime() ? value.stack : undefined,
            ...customProperties,
        };
    }

    if (Array.isArray(value)) {
        return value.map(redact);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const objectValue = value as Record<string, unknown>;
    if (isExpoLaunchManifest(objectValue)) {
        return '[expo launch manifest redacted]';
    }

    return Object.fromEntries(
        Object.entries(objectValue).map(([key, entry]) => [
            key,
            SECRET_KEY_RE.test(key) ? '[redacted]' : redact(entry),
        ]),
    );
};

const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (level === 'debug' && !isDevRuntime()) {
        return;
    }

    const payload = meta ? [message, safeStringify(redact(meta))] : [message];
    if (level === 'error') {
        console.error(...payload);
    } else if (level === 'warn') {
        console.warn(...payload);
    } else {
        console.log(...payload);
    }
};

export const logger = {
    debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
