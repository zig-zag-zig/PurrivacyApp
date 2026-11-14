import * as DocumentPicker from 'expo-document-picker';
import { Buffer } from 'buffer';
import { File } from 'expo-file-system';
import { validateArmor } from '../../features/keys/domain/pgpValidation';

/** Text is rendered in the composer and sent through the WebView bridge; keep
 * it well below the Binder transaction budget. Larger inputs belong in File
 * mode, which streams bytes instead of holding the whole plaintext in JS. */
const MAX_TEXT_FILE_BYTES = 1024 * 1024;

/** Text-oriented MIME types shown in the picker. MIME mapping varies by
 * provider, so this is a noise filter — content is still validated. */
const TEXT_MIME_TYPES = [
    'text/*',
    'application/json',
    'application/xml',
    'application/x-yaml',
    'application/yaml',
    'application/toml',
    'application/rtf',
    'application/x-subrip',
    'application/x-ndjson',
];

/** Armored key/message files are often reported as generic PGP or octet-stream. */
const PGP_MIME_TYPES = [
    'application/pgp',
    'application/pgp-encrypted',
    'application/pgp-keys',
    'application/pgp-signature',
    'application/octet-stream',
];

const isUserFacingFilePickerError = (message: string): boolean => (
    /^Only text files/.test(message) ||
    /^Text file is larger than/.test(message) ||
    /^Invalid PGP (key|message) format\./.test(message)
);

const hasUtf16Bom = (bytes: Uint8Array): boolean => (
    bytes.length >= 2
    && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
);

const looksLikeText = (bytes: Uint8Array): boolean => {
    if (bytes.length === 0) return true;
    // UTF-16 text legitimately contains NUL bytes; its BOM is the tell.
    if (hasUtf16Bom(bytes)) return true;

    const sampleSize = Math.min(bytes.length, 8192);
    let controlBytes = 0;
    for (let index = 0; index < sampleSize; index += 1) {
        const byte = bytes[index];
        if (byte === 0) return false;
        // Allow tab, LF, CR and printable ASCII. Bytes >= 0x80 are UTF-8
        // lead/continuation bytes, not control characters.
        if (byte < 7 || (byte > 13 && byte < 32)) controlBytes += 1;
    }
    return controlBytes / sampleSize < 0.02;
};

const decodeText = (bytes: Uint8Array): string => {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return Buffer.from(bytes.subarray(2)).toString('utf16le');
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        const swapped = new Uint8Array(bytes.length - 2);
        for (let index = 2; index + 1 < bytes.length; index += 2) {
            swapped[index - 2] = bytes[index + 1];
            swapped[index - 1] = bytes[index];
        }
        return Buffer.from(swapped).toString('utf16le');
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return Buffer.from(bytes.subarray(3)).toString('utf8');
    }
    return Buffer.from(bytes).toString('utf8');
};

interface FilePickerOptions {
    /** Validate the picked text as an armored PGP key or message. */
    validatePGP?: 'key' | 'message';
    /** Reject binary files instead of feeding decoded garbage to the caller. */
    requireText?: boolean;
    /** Maximum file size for text reads. */
    maxBytes?: number;
}

const mimeTypesFor = (validatePGP?: 'key' | 'message'): string[] => (
    validatePGP ? [...TEXT_MIME_TYPES, ...PGP_MIME_TYPES] : TEXT_MIME_TYPES
);

/**
 * Pick a text file and return its contents.
 *
 * The system picker is limited to text MIME types (plus PGP armor types for
 * key/message flows) so obvious binaries are not offered. MIME metadata is
 * inconsistent across providers, so the bytes are still checked: binary files
 * belong in File mode, where they are streamed byte-for-byte.
 */
export const useFilePicker = ({
    validatePGP,
    requireText = true,
    maxBytes = MAX_TEXT_FILE_BYTES,
}: FilePickerOptions = {}) => {
    const pickFile = async (onFilePicked: (content: string) => void, onError?: (msg: string) => void) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: mimeTypesFor(validatePGP),
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.length) return;

            const asset = result.assets[0];
            const file = new File(asset.uri);
            const fileSize = asset.size ?? file.info().size;

            if (requireText) {
                if (fileSize != null && fileSize > maxBytes) {
                    throw new Error(`Text file is larger than ${Math.floor(maxBytes / (1024 * 1024))} MB. Use File mode for large files`);
                }

                const bytes = new Uint8Array(await file.arrayBuffer());
                if (!looksLikeText(bytes)) {
                    throw new Error('Only text files can be read here. Use File mode for binary files like PDFs');
                }
                const fileContent = decodeText(bytes);
                validatePickedContent(fileContent, validatePGP);
                onFilePicked(fileContent);
                return;
            }

            const fileContent = await file.text();
            validatePickedContent(fileContent, validatePGP);
            onFilePicked(fileContent);
        } catch (error: any) {
            const message = typeof error?.message === 'string' && isUserFacingFilePickerError(error.message)
                ? error.message
                : 'Failed to pick file';
            onError?.(message);
        }
    };

    return pickFile;
};

const validatePickedContent = (fileContent: string, validatePGP?: 'key' | 'message'): void => {
    if (validatePGP === 'key') {
        const isValidKey = validateArmor(fileContent, 'PUBLIC KEY BLOCK') ||
            validateArmor(fileContent, 'PRIVATE KEY BLOCK');
        if (!isValidKey) {
            throw new Error('Invalid PGP key format. Must include proper armor headers and base64 content');
        }
    } else if (validatePGP === 'message') {
        if (!validateArmor(fileContent, 'MESSAGE')) {
            throw new Error('Invalid PGP message format. Use an ASCII-armored message (-----BEGIN PGP MESSAGE-----); binary .pgp files belong in File mode');
        }
    }
};
