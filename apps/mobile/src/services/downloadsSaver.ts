/**
 * Saves file-crypto output into the public Downloads/Purrivacy folder via the
 * PurrivacyDownloads native module (MediaStore), so results are findable in a
 * file manager instead of only existing in the app cache (share-only).
 *
 * The native module is reached through a lazy require so importing this module
 * in a non-RN context (unit tests, node) stays safe.
 */

const MODULE_NAME = 'PurrivacyDownloads';

interface DownloadsSaverNative {
    saveToDownloads: (fileName: string, mimeType: string, sourceUri: string) => Promise<string>;
    openFile: (uri: string, mimeType: string) => Promise<boolean>;
    showInFolder: () => Promise<boolean>;
}

const getNative = (): DownloadsSaverNative | null => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const rn = require('react-native') as typeof import('react-native');
        if (rn.Platform?.OS !== 'android') return null;
        return (rn.NativeModules?.[MODULE_NAME] as DownloadsSaverNative | undefined) ?? null;
    } catch {
        return null;
    }
};

/** MIME type for a saved result, from its extension. */
export const mimeTypeForFileName = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
        case 'pgp':
        case 'gpg':
        case 'asc':
            return 'application/pgp-encrypted';
        case 'txt':
            return 'text/plain';
        case 'pdf':
            return 'application/pdf';
        case 'zip':
            return 'application/zip';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'mp3':
            return 'audio/mpeg';
        case 'wav':
            return 'audio/wav';
        case 'mp4':
            return 'video/mp4';
        default:
            return 'application/octet-stream';
    }
};

/** True when saving to Downloads is available on this device/build. */
export const canSaveToDownloads = (): boolean => getNative() !== null;

/**
 * Copy `sourceUri` (a file:// cache path) into Downloads/Purrivacy.
 * Returns the saved content URI, or null when unsupported/unavailable.
 */
export const saveToDownloads = async (
    fileName: string,
    sourceUri: string,
): Promise<string | null> => {
    const native = getNative();
    if (!native) return null;
    try {
        return await native.saveToDownloads(fileName, mimeTypeForFileName(fileName), sourceUri);
    } catch {
        return null;
    }
};

/**
 * Open a saved/result file in whatever app handles it. Prefers the public
 * Downloads copy (content:// URI) and falls back to the app-cache file:// URI.
 * Returns false when no handler exists (e.g. a .pgp file).
 */
export const openResultFile = async (
    fileName: string,
    savedUri?: string | null,
    cacheUri?: string | null,
): Promise<boolean> => {
    const native = getNative();
    if (!native) return false;
    const mimeType = mimeTypeForFileName(fileName);
    const candidates = [savedUri, cacheUri].filter((u): u is string => Boolean(u));
    for (const uri of candidates) {
        try {
            await native.openFile(uri, mimeType);
            return true;
        } catch {
            // Try the next candidate.
        }
    }
    return false;
};

/** Reveal Downloads/Purrivacy in the file manager (best effort). */
export const showResultsInFolder = async (): Promise<boolean> => {
    const native = getNative();
    if (!native) return false;
    try {
        return await native.showInFolder();
    } catch {
        return false;
    }
};
