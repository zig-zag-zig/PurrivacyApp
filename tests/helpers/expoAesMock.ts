import { Buffer } from 'buffer';
import { vi } from 'vitest';

type BinaryInput = string | Uint8Array | ArrayBuffer;
type OutputEncoding = 'base64' | 'bytes';

type SealedDataConfig = {
    ciphertextBase64: string;
    ivBase64: string;
    tagBase64: string;
};

const DEFAULT_IV_BASE64 = Buffer.from('mock-iv', 'utf8').toString('base64');
const DEFAULT_TAG_BASE64 = Buffer.from('mock-tag', 'utf8').toString('base64');

const toBytes = (input: BinaryInput): Uint8Array => {
    if (typeof input === 'string') {
        return Uint8Array.from(Buffer.from(input, 'base64'));
    }

    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }

    return input;
};

const toBase64 = (input: BinaryInput): string => (
    typeof input === 'string' ? input : Buffer.from(toBytes(input)).toString('base64')
);

const fromBase64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'));

const createExpoAesSealedData = ({
    ciphertextBase64,
    ivBase64,
    tagBase64,
}: SealedDataConfig) => ({
    ciphertextValue: ciphertextBase64,
    ivValue: ivBase64,
    tagValue: tagBase64,
    ciphertext: vi.fn(async (options?: { includeTag?: boolean; encoding?: OutputEncoding; }) => {
        const base64Value = options?.includeTag
            ? Buffer.concat([fromBase64(ciphertextBase64), fromBase64(tagBase64)]).toString('base64')
            : ciphertextBase64;

        return options?.encoding === 'base64' ? base64Value : fromBase64(base64Value);
    }),
    iv: vi.fn(async (encoding?: OutputEncoding) => (
        encoding === 'base64' ? ivBase64 : fromBase64(ivBase64)
    )),
    tag: vi.fn(async (encoding?: OutputEncoding) => (
        encoding === 'base64' ? tagBase64 : fromBase64(tagBase64)
    )),
});

type ExpoAesSealedDataMock = ReturnType<typeof createExpoAesSealedData>;

type ExpoAesMockConfig = {
    encryptCiphertextBase64?: string;
    encryptIvBase64?: string;
    encryptTagBase64?: string;
    decryptPlaintextBase64?: string | null;
};

const createSealedDataConfig = (
    config: ExpoAesMockConfig,
    plaintextBase64: string,
): SealedDataConfig => ({
    ciphertextBase64: config.encryptCiphertextBase64 ?? plaintextBase64,
    ivBase64: config.encryptIvBase64 ?? DEFAULT_IV_BASE64,
    tagBase64: config.encryptTagBase64 ?? DEFAULT_TAG_BASE64,
});

export const createExpoAesMock = (initialConfig: ExpoAesMockConfig = {}) => {
    const config = { ...initialConfig };
    const initialDecryptPlaintextBase64 = initialConfig.decryptPlaintextBase64 ?? null;
    let decryptPlaintextBase64 = initialDecryptPlaintextBase64;
    let lastFromPartsResult: ExpoAesSealedDataMock | null = null;

    const importKey = vi.fn(async (key: string, encoding?: 'hex' | 'base64') => ({ key, encoding }));
    const fromParts = vi.fn((iv: BinaryInput, ciphertext: BinaryInput, tag: BinaryInput) => {
        lastFromPartsResult = createExpoAesSealedData({
            ivBase64: toBase64(iv),
            ciphertextBase64: toBase64(ciphertext),
            tagBase64: toBase64(tag),
        });

        return lastFromPartsResult;
    });
    const encryptAsync = vi.fn(async (plaintextBase64: string) => (
        createExpoAesSealedData(createSealedDataConfig(config, plaintextBase64))
    ));
    const decryptAsync = vi.fn(async (
        sealedData: ExpoAesSealedDataMock,
        _key: unknown,
        options?: { output?: OutputEncoding; },
    ) => {
        const plaintextBase64 = decryptPlaintextBase64 ?? sealedData.ciphertextValue;
        return options?.output === 'base64' ? plaintextBase64 : fromBase64(plaintextBase64);
    });

    const controls = {
        importKey,
        get lastFromPartsResult(): ExpoAesSealedDataMock | null {
            return lastFromPartsResult;
        },
        set lastFromPartsResult(value: ExpoAesSealedDataMock | null) {
            lastFromPartsResult = value;
        },
        fromParts,
        encryptAsync,
        decryptAsync,
        reset: (): void => {
            decryptPlaintextBase64 = initialDecryptPlaintextBase64;
            lastFromPartsResult = null;
            importKey.mockClear();
            fromParts.mockClear();
            encryptAsync.mockClear();
            decryptAsync.mockClear();
        },
        module: {
            AESEncryptionKey: {
                'import': importKey,
            },
            AESSealedData: {
                fromParts,
            },
            aesEncryptAsync: encryptAsync,
            aesDecryptAsync: decryptAsync,
        },
    };

    return controls;
};

export type ExpoAesMockControls = ReturnType<typeof createExpoAesMock>;
