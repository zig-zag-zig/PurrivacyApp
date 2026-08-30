import {
  MAX_DEK_ENCRYPTED_DATA_LENGTH,
  MAX_ENCRYPTED_KEY_DATA_LENGTH,
  MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH,
} from '../../../../../src/core/constants';
import { EncryptedUserDataValidator } from '../../../../../src/features/user/domain/EncryptedUserDataValidator';
import { BadRequestError } from '../../../../../src/utils/errors';

const base64 = (length: number): string => 'A'.repeat(length);

const encryptedBase = (encryptedDataLength: number) => ({
  encryptedData: base64(encryptedDataLength),
  iv: 'a'.repeat(24),
  tag: 'b'.repeat(32),
});

const encrypted = (encryptedDataLength: number) => ({
  ...encryptedBase(encryptedDataLength),
  salt: 'c'.repeat(32),
});

describe('EncryptedUserDataValidator', () => {
  it('rejects oversized encrypted key records before storage writes', () => {
    expect(() => EncryptedUserDataValidator.sanitizeEncryptedKeys([
      encryptedBase(MAX_ENCRYPTED_KEY_DATA_LENGTH + 4),
    ])).toThrow(BadRequestError);
  });

  it('rejects oversized total encrypted key payloads', () => {
    const keyDataLength = Math.floor((MAX_ENCRYPTED_KEYS_TRANSFER_LENGTH / 3) / 4) * 4;

    expect(() => EncryptedUserDataValidator.sanitizeEncryptedKeys([
      encryptedBase(keyDataLength),
      encryptedBase(keyDataLength),
      encryptedBase(keyDataLength),
      encryptedBase(keyDataLength),
    ])).toThrow(BadRequestError);
  });

  it('accepts encrypted key payloads that fit RTDB-backed transfer limits', () => {
    expect(EncryptedUserDataValidator.sanitizeEncryptedKeys([
      encryptedBase(900_000),
    ])).toHaveLength(1);
  });

  it('keeps DEK encrypted records small', () => {
    expect(() => EncryptedUserDataValidator.sanitizeSaltedEncryptedPayload(
      encrypted(MAX_DEK_ENCRYPTED_DATA_LENGTH + 4),
      'dekPassword',
    )).toThrow(BadRequestError);
  });

  it('accepts a compact create-user encrypted payload', () => {
    expect(EncryptedUserDataValidator.sanitizeUserForCreate({
      dekPassword: encrypted(44),
      dekSeed: encrypted(44),
      keys: [encryptedBase(128)],
      recoveryVerifierSalt: '1'.repeat(32),
      recoveryVerifierHash: '2'.repeat(64),
    })).toMatchObject({
      mfaEnabled: false,
      keys: expect.any(Array),
    });
  });
});
