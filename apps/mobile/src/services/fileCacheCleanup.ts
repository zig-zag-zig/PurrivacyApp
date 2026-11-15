import { Directory, File, Paths } from 'expo-file-system';

/**
 * Local file-crypto artifact cleanup.
 *
 * DocumentPicker copies picked files into the app cache, and file encryption /
 * decryption writes its outputs there so the Activity sheet can share them.
 * Those copies are plaintext (or recoverable) data and must not outlive the
 * operation or the unlocked vault.
 */

const PICKER_CACHE_DIRECTORY = 'DocumentPicker';
const FILE_CRYPTO_PREFIXES = ['purrivacy-', 'e2e-test-'];

const cacheRootUri = (): string => {
    const uri = Paths.cache.uri;
    return uri.endsWith('/') ? uri : `${uri}/`;
};

const isWithinCache = (uri: string): boolean => {
    const root = cacheRootUri();
    const relativePath = uri.startsWith(root) ? uri.slice(root.length) : '';
    return Boolean(relativePath)
        && !relativePath.split('/').some(segment => segment === '..' || segment === '.');
};

/** True only for a file inside the app cache (never Downloads/content URIs). */
export const isCacheUri = (uri: string): boolean => isWithinCache(uri);

/** Best-effort delete of a single app-cache file. */
export const deleteCachedFile = (uri?: string | null): void => {
    if (!uri || !isCacheUri(uri)) return;
    try {
        const file = new File(uri);
        if (file.exists) {
            file.delete();
        }
    } catch {
        // Cleanup is best effort. A failed delete must never break the flow.
    }
};

/**
 * Remove all file-crypto leftovers from the app cache:
 * - DocumentPicker's copied source files,
 * - `purrivacy-*` encryption/decryption outputs,
 * - `e2e-test-*` deterministic test files.
 *
 * Called on startup, vault lock, sign-out, and account deletion.
 */
export const purgeFileCryptoCaches = (): void => {
    try {
        const cache = new Directory(Paths.cache);
        if (!cache.exists) return;

        for (const entry of cache.list()) {
            if (entry instanceof Directory && entry.name === PICKER_CACHE_DIRECTORY) {
                entry.delete();
                continue;
            }
            if (entry instanceof File && FILE_CRYPTO_PREFIXES.some(prefix => entry.name.startsWith(prefix))) {
                entry.delete();
            }
        }
    } catch {
        // Best effort: a partially unavailable cache must not crash startup or lock.
    }
};