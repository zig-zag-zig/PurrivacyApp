import { File, Paths } from 'expo-file-system';

/**
 * Legacy flat cache file written by the pre-refactor generic storage helper.
 * Named stores perform a one-time, read-only migration from this file so
 * existing installs keep their data after the per-store file layout is adopted.
 */
const LEGACY_CACHE_FILE_NAME = 'app-cache.json';

/**
 * Property names that must never appear in plaintext cache-store values.
 * Secrets (passphrases, private keys, mnemonics, DEKs, access tokens) belong
 * in SecureStore or an encrypted store, never in a cache JSON file.
 */
const SECRET_PROPERTY_NAMES = new Set([
    'accessToken',
    'dek',
    'encryptionKey',
    'mnemonic',
    'passphrase',
    'privateKey',
    'privateKeyPassphrase',
    'private_key',
    'recoveryKey',
    'seed',
    'seedPhrase',
]);

/**
 * A named, typed file-backed store. Each store owns one cache file and one
 * explicit value type; there is deliberately no generic put/get-any API.
 */
export interface TypedStore<T> {
    read(): Promise<T>;
    write(value: T): Promise<void>;
    update(updater: (current: T) => T): Promise<T>;
    clear(): Promise<void>;
}

interface FileStoreOptions<T> {
    /** Cache file name, relative to Paths.cache. */
    fileName: string;
    /** Value returned when the file is missing, corrupted, or invalid. */
    defaultValue: T;
    /** Runtime guard that rejects persisted values of the wrong shape. */
    isValid: (value: unknown) => value is T;
    /**
     * When true (default), rejects values containing secret-classified
     * property names (see SECRET_PROPERTY_NAMES) before every write.
     */
    guardSecrets?: boolean;
    /** Custom set of forbidden property names; defaults to the secret set. */
    forbiddenPropertyNames?: ReadonlySet<string>;
    /**
     * One-time, read-only migration from the legacy flat app-cache.json.
     * Runs only when the store's own file does not exist yet.
     */
    migrateLegacy?: (legacy: Record<string, unknown>) => T | undefined;
    /**
     * Dev-only store: every operation no-ops outside __DEV__, so dev-only
     * fixtures can never be read or written by production code paths.
     */
    devOnly?: boolean;
}

function assertNoSecretFields(value: unknown, forbidden: ReadonlySet<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            assertNoSecretFields(item, forbidden);
        }
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            if (forbidden.has(key)) {
                throw new Error(
                    `refusing to persist secret-classified property "${key}" in plaintext cache store`,
                );
            }
            assertNoSecretFields(child, forbidden);
        }
    }
}

let legacyCachePromise: Promise<Record<string, unknown> | null> | null = null;

async function readLegacyCache(): Promise<Record<string, unknown> | null> {
    if (!legacyCachePromise) {
        legacyCachePromise = (async () => {
            const legacyFile = new File(Paths.cache, LEGACY_CACHE_FILE_NAME);
            if (!legacyFile.exists) {
                return null;
            }
            try {
                const parsed: unknown = JSON.parse(await legacyFile.text());
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>;
                }
            } catch {
                // Corrupted legacy file: nothing to migrate.
            }
            return null;
        })();
    }
    return legacyCachePromise;
}

export function createFileStore<T>(options: FileStoreOptions<T>): TypedStore<T> {
    const file = new File(Paths.cache, options.fileName);
    const forbidden = options.guardSecrets === false
        ? null
        : options.forbiddenPropertyNames ?? SECRET_PROPERTY_NAMES;
    const isActive = () => !options.devOnly || __DEV__;

    let loaded = false;
    let memoryValue: T | null = null;
    let loadPromise: Promise<void> | null = null;

    function persistValue(value: T): void {
        if (!file.exists) {
            file.create({ intermediates: true, overwrite: true });
        }
        file.write(JSON.stringify(value));
    }

    async function load(): Promise<void> {
        if (!loadPromise) {
            loadPromise = (async () => {
                if (file.exists) {
                    try {
                        const parsed: unknown = JSON.parse(await file.text());
                        if (options.isValid(parsed)) {
                            memoryValue = parsed;
                            loaded = true;
                            return;
                        }
                    } catch {
                        // Corrupted or unreadable file: fall back to the default.
                    }
                } else if (options.migrateLegacy) {
                    const legacy = await readLegacyCache();
                    if (legacy) {
                        const migrated = options.migrateLegacy(legacy);
                        if (migrated !== undefined) {
                            memoryValue = migrated;
                            loaded = true;
                            try {
                                persistValue(migrated);
                            } catch {
                                // Migration persistence is best-effort; the
                                // in-memory value is usable for this session.
                            }
                            return;
                        }
                    }
                }
                memoryValue = options.defaultValue;
                loaded = true;
            })();
        }
        await loadPromise;
    }

    const read = async (): Promise<T> => {
        if (!isActive()) return options.defaultValue;
        if (!loaded) await load();
        return memoryValue as T;
    };

    const write = async (value: T): Promise<void> => {
        if (!isActive()) return;
        if (forbidden) assertNoSecretFields(value, forbidden);
        memoryValue = value;
        loaded = true;
        persistValue(value);
    };

    const update = async (updater: (current: T) => T): Promise<T> => {
        const next = updater(await read());
        await write(next);
        return next;
    };

    const clear = async (): Promise<void> => {
        if (!isActive()) return;
        memoryValue = options.defaultValue;
        loaded = true;
        if (file.exists) file.delete();
    };

    return { read, write, update, clear };
}
