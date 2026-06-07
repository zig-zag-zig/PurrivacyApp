import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import type { ExpoAesMockControls } from './helpers/expoAesMock';

const cryptoMock = vi.hoisted(() => ({
  getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(1)),
}));

const aesMockRef = vi.hoisted((): { current: ExpoAesMockControls | null; } => ({
  current: null,
}));

const securityServiceMock = vi.hoisted(() => ({
  setDek: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
}));

const quickCryptoMock = vi.hoisted(() => ({
  pbkdf2: vi.fn((
    _password: string,
    _salt: Uint8Array,
    _iterations: number,
    keyLength: number,
    _digest: string,
    callback: (error: Error | null, derivedKey?: Buffer) => void,
  ) => callback(null, Buffer.alloc(keyLength, 9))),
}));

vi.mock('expo-crypto', () => cryptoMock);

vi.mock('expo-crypto/build/aes', async () => {
  const { createExpoAesMock } = await import('./helpers/expoAesMock');
  aesMockRef.current = createExpoAesMock({
    encryptCiphertextBase64: 'Y2lwaGVydGV4dA==',
    encryptTagBase64: 'AgICAgICAgICAgICAgICAg==',
    decryptPlaintextBase64: 'ZGVjcnlwdGVkLXZhbHVl',
  });

  return aesMockRef.current.module;
});

vi.mock('../src/features/security/services/securityService', () => ({
  securityService: securityServiceMock,
}));

vi.mock('../src/utils/logger', () => ({
  logger: loggerMock,
}));

vi.mock('react-native-quick-crypto', () => ({
  'default': quickCryptoMock,
}));

import { decryptData, encryptData } from '../src/features/auth/services/authCrypto';

const dek = 'a'.repeat(64);
const encryptedDataBase64 = 'Y2lwaGVydGV4dA==';
const bytesFromBase64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'));
const bytesFromHex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));

const aesMock = (): ExpoAesMockControls => {
  if (!aesMockRef.current) {
    throw new Error('Expo AES mock was not initialized');
  }

  return aesMockRef.current;
};

beforeEach(() => {
  vi.clearAllMocks();
  aesMock().lastFromPartsResult = null;
});

describe('auth crypto Expo AES bridge inputs', () => {
  it('encrypts with base64 string plaintext and nonce inputs for Android', async () => {
    const result = await encryptData('hello', dek);
    const expectedIvHex = '01'.repeat(12);

    expect(aesMock().importKey).toHaveBeenCalledWith(dek, 'hex');
    expect(aesMock().encryptAsync).toHaveBeenCalledWith(
      Buffer.from('hello', 'utf8').toString('base64'),
      expect.anything(),
      {
        nonce: { bytes: Buffer.from(expectedIvHex, 'hex').toString('base64') },
        tagLength: 16,
      },
    );
    const sealed = await aesMock().encryptAsync.mock.results[0].value;
    expect(sealed.ciphertext).toHaveBeenCalledWith();
    expect(sealed.tag).toHaveBeenCalledWith();
    expect(result).toEqual({
      encryptedData: encryptedDataBase64,
      iv: expectedIvHex,
      tag: '02'.repeat(16),
    });
  });

  it('decrypts from byte-array sealed-data parts and base64 output for Android', async () => {
    const iv = '03'.repeat(12);
    const tag = '04'.repeat(16);

    await expect(decryptData({
      userId: 'user-123',
      encryptedData: encryptedDataBase64,
      keyMaterial: dek,
      iv,
      keyIsPasswordOrSeed: false,
      tag,
    })).resolves.toBe('decrypted-value');

    expect(aesMock().fromParts).toHaveBeenCalledWith(
      bytesFromHex(iv),
      bytesFromBase64(encryptedDataBase64),
      bytesFromHex(tag),
    );
    expect(aesMock().lastFromPartsResult?.ciphertextValue).toBe(encryptedDataBase64);
    expect(aesMock().decryptAsync).toHaveBeenCalledWith(
      aesMock().lastFromPartsResult,
      expect.anything(),
      { output: 'base64' },
    );
  });
});
