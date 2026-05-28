import * as Crypto from 'expo-crypto';
import crypto from 'react-native-quick-crypto';
import { Buffer } from 'buffer';

import type { Encryption, EncryptionBase } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { securityService } from '../../security/services/securityService';

const { createCipheriv, createDecipheriv, pbkdf2 } = crypto;

const ALGORITHM = 'aes-256-gcm' as const;
const PBKDF2_ITERATIONS = 600000;
const KEY_SIZE = 256;
export const AUTH_SALT_LENGTH = 16;
const IV_LENGTH = 12;
const DEK_LENGTH = 32;

export async function randomHex(bytes: number): Promise<string> {
  const buf = await Crypto.getRandomBytesAsync(bytes);
  return Buffer.from(buf).toString('hex');
}

export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    pbkdf2(
      password,
      Buffer.from(salt, 'hex'),
      iterations,
      KEY_SIZE / 8,
      'sha256',
      (err: any, derivedKey: any) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      },
    );
  });
}

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

    const iv = await randomHex(IV_LENGTH);
    const salt = await randomHex(AUTH_SALT_LENGTH);
    const derivedKey = await deriveKey(passwordOrSeed, salt);

    const cipher = createCipheriv(
      ALGORITHM,
      Buffer.from(derivedKey, 'hex'),
      Buffer.from(iv, 'hex'),
      { authTagLength: 16 },
    );

    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(dek, 'hex')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      encryptedData: encrypted.toString('base64'),
      iv,
      salt,
      tag: tag.toString('hex'),
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

    const iv = await randomHex(IV_LENGTH);
    const cipher = createCipheriv(
      ALGORITHM,
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'hex'),
      { authTagLength: 16 },
    );

    const encrypted = Buffer.concat([
      cipher.update(dataBuffer),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      encryptedData: encrypted.toString('base64'),
      iv,
      tag: tag.toString('hex'),
    };
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

    const decipher = createDecipheriv(
      ALGORITHM,
      Buffer.from(derivedKey, 'hex'),
      Buffer.from(iv, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'base64')),
      decipher.final(),
    ]);

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
