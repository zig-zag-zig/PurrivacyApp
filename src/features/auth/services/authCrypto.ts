import * as Crypto from 'expo-crypto';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto/build/aes';
import { Buffer } from 'buffer';
import crypto from 'react-native-quick-crypto';

import type { Encryption, EncryptionBase } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { securityService } from '../../security/services/securityService';

export const PBKDF2_ITERATIONS = 600000;
export const KEY_SIZE = 256;
export const AUTH_SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const DEK_LENGTH = 32;

const { pbkdf2 } = crypto;

const bytesFromBase64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'));
const bytesFromHex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const bytesToBase64 = (value: Uint8Array): string => Buffer.from(value).toString('base64');
const bytesToHex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

export async function randomHex(bytes: number): Promise<string> {
  const buf = await Crypto.getRandomBytesAsync(bytes);
  return Buffer.from(buf).toString('hex');
}

export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const saltBytes = Buffer.from(salt, 'hex');
  return await new Promise((resolve, reject) => {
    pbkdf2(password, saltBytes, iterations, KEY_SIZE / 8, 'sha256', (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      if (!derivedKey) {
        reject(new Error('PBKDF2 did not return a derived key'));
        return;
      }

      resolve(derivedKey.toString('hex'));
    });
  });
}

const importAesKey = async (key: string): Promise<AESEncryptionKey> => {
  return AESEncryptionKey.import(key, 'hex');
};

const encryptBytes = async (
  plaintext: Uint8Array,
  key: string,
  iv?: string,
): Promise<EncryptionBase> => {
  const resolvedIv = iv ?? await randomHex(IV_LENGTH);

  const sealed = await aesEncryptAsync(
    Buffer.from(plaintext).toString('base64'),
    await importAesKey(key),
    {
      nonce: { bytes: Buffer.from(resolvedIv, 'hex').toString('base64') },
      tagLength: 16,
    },
  );

  const encryptedData = bytesToBase64(await sealed.ciphertext());

  if (!encryptedData) {
    throw new Error('AES encryption returned empty ciphertext');
  }

  return {
    encryptedData,
    iv: resolvedIv,
    tag: bytesToHex(await sealed.tag()),
  };
};

export async function generateEncryptionKeys(
  password: string,
  recoverySeed: string,
): Promise<{
  passwordEncrypted: Encryption;
  seedEncrypted: Encryption;
  dek: string;
}> {
  try {
    const dek = await randomHex(DEK_LENGTH);

    const passwordEncrypted = await encryptDek(dek, password);
    const seedEncrypted = await encryptDek(dek, recoverySeed);

    return { passwordEncrypted, seedEncrypted, dek };
  } catch (error) {
    logger.warn('encryption key generation failed', { error });
    throw new Error('Failed to generate encryption keys');
  }
}

export async function encryptDek(
  dek: string,
  passwordOrSeed: string,
): Promise<Encryption> {
  try {
    if (dek.length !== DEK_LENGTH * 2) {
      throw new Error('Invalid DEK length');
    }

    const salt = await randomHex(AUTH_SALT_LENGTH);
    const derivedKey = await deriveKey(passwordOrSeed, salt);

    return {
      ...await encryptBytes(Buffer.from(dek, 'hex'), derivedKey),
      salt,
    };
  } catch (error) {
    logger.warn('dek encryption failed', { error });
    throw new Error('Failed to encrypt DEK');
  }
}

export async function encryptData(
  data: object | string,
  key: string,
): Promise<EncryptionBase> {
  try {
    if (key.length !== DEK_LENGTH * 2) {
      throw new Error('Invalid encryption key length');
    }

    const dataBuffer = typeof data === 'string'
      ? Buffer.from(data, 'utf8')
      : Buffer.from(JSON.stringify(data), 'utf8');

    return await encryptBytes(dataBuffer, key);
  } catch (error) {
    logger.warn('data encryption failed', { error });
    throw new Error('Failed to encrypt data');
  }
}

type DecryptDataParams = {
  userId: string;
  encryptedData: string;
  keyMaterial: string;
  iv: string;
  keyIsPasswordOrSeed: boolean;
  tag: string;
  salt?: string;
};

export async function decryptData({
  userId,
  encryptedData,
  keyMaterial,
  iv,
  keyIsPasswordOrSeed,
  tag,
  salt,
}: DecryptDataParams): Promise<string> {
  try {
    let derivedKey = keyMaterial;

    if (keyIsPasswordOrSeed) {
      if (!salt) throw new Error('Salt required for password/seed decryption');
      derivedKey = await deriveKey(keyMaterial, salt);
    }

    if (derivedKey.length !== DEK_LENGTH * 2) {
      throw new Error('Invalid derived key length');
    }

    if (Buffer.from(tag, 'hex').length !== 16) {
      throw new Error('Invalid GCM tag length');
    }

    const sealedData = AESSealedData.fromParts(
      bytesFromHex(iv),
      bytesFromBase64(encryptedData),
      bytesFromHex(tag),
    );
    const decrypted = Buffer.from(await aesDecryptAsync(
      sealedData,
      await importAesKey(derivedKey),
      { output: 'base64' },
    ), 'base64');

    const result = keyIsPasswordOrSeed ? decrypted.toString('hex') : decrypted.toString('utf8');

    if (keyIsPasswordOrSeed) {
      await securityService.setDek(userId, result);
    }

    return result;
  } catch (error) {
    logger.warn('data decryption failed', { error });
    throw new Error('Failed to decrypt data');
  }
}
