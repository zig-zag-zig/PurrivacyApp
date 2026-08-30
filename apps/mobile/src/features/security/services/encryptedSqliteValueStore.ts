import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SQLiteStorage } from 'expo-sqlite/kv-store';
import {
    AESEncryptionKey,
    AESSealedData,
    aesDecryptAsync,
    aesEncryptAsync,
} from 'expo-crypto/build/aes';
import { Buffer } from 'buffer';

const ENCRYPTION_KEY_SECURE_STORE_KEY = 'purrivacy_sqlite_value_encryption_key_v1';
const ENCRYPTED_VALUE_DB = 'purrivacy_encrypted_values.db';
const NON_SENSITIVE_VALUE_DB = 'purrivacy_preferences.db';
const GCM_TAG_LENGTH = 16;

type EncryptedValueEnvelope = {
    version: 1;
    ciphertext: string;
    iv: string;
    tag: string;
};

const encryptedValueStore = new SQLiteStorage(ENCRYPTED_VALUE_DB);
export const nonSensitiveValueStore = new SQLiteStorage(NON_SENSITIVE_VALUE_DB);

let encryptionKeyPromise: Promise<string> | null = null;

const bytesFromBase64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'));
const bytesToBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const getOrCreateStorageEncryptionKey = async (): Promise<string> => {
    if (!encryptionKeyPromise) {
        encryptionKeyPromise = (async () => {
            const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_SECURE_STORE_KEY);
            if (existing) {
                return existing;
            }

            const generated = bytesToBase64(await Crypto.getRandomBytesAsync(32));
            await SecureStore.setItemAsync(ENCRYPTION_KEY_SECURE_STORE_KEY, generated, {
                keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
            return generated;
        })();
    }

    return encryptionKeyPromise;
};

const importStorageEncryptionKey = async (): Promise<AESEncryptionKey> => (
    AESEncryptionKey.import(await getOrCreateStorageEncryptionKey(), 'base64')
);

const isEncryptedValueEnvelope = (value: unknown): value is EncryptedValueEnvelope => (
    typeof value === 'object'
    && value !== null
    && (value as Partial<EncryptedValueEnvelope>).version === 1
    && typeof (value as Partial<EncryptedValueEnvelope>).ciphertext === 'string'
    && typeof (value as Partial<EncryptedValueEnvelope>).iv === 'string'
    && typeof (value as Partial<EncryptedValueEnvelope>).tag === 'string'
);

export const setEncryptedSqliteValue = async (key: string, value: string): Promise<void> => {
    const encryptionKey = await importStorageEncryptionKey();
    const sealed = await aesEncryptAsync(Buffer.from(value, 'utf8').toString('base64'), encryptionKey, {
        tagLength: GCM_TAG_LENGTH,
    });
    const envelope: EncryptedValueEnvelope = {
        version: 1,
        ciphertext: bytesToBase64(await sealed.ciphertext()),
        iv: bytesToBase64(await sealed.iv()),
        tag: bytesToBase64(await sealed.tag()),
    };

    await encryptedValueStore.setItemAsync(key, JSON.stringify(envelope));
};

export const getEncryptedSqliteValue = async (key: string): Promise<string | null> => {
    const raw = await encryptedValueStore.getItemAsync(key);
    if (!raw) {
        return null;
    }

    let envelope: unknown;
    try {
        envelope = JSON.parse(raw);
    } catch {
        await deleteEncryptedSqliteValue(key);
        return null;
    }

    if (!isEncryptedValueEnvelope(envelope)) {
        await deleteEncryptedSqliteValue(key);
        return null;
    }

    const encryptionKey = await importStorageEncryptionKey();
    const sealed = AESSealedData.fromParts(
        bytesFromBase64(envelope.iv),
        bytesFromBase64(envelope.ciphertext),
        bytesFromBase64(envelope.tag),
    );
    const plaintext = await aesDecryptAsync(sealed, encryptionKey, { output: 'base64' });
    return Buffer.from(plaintext, 'base64').toString('utf8');
};

export const deleteEncryptedSqliteValue = async (key: string): Promise<void> => {
    await encryptedValueStore.removeItemAsync(key);
};
