import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyPairWithRecordId, UserDecrypted } from '../../../types/types';

const mocks = vi.hoisted(() => ({
  changePassphrase: vi.fn(),
  extractKeyMetadata: vi.fn(),
  getUserDecrypted: vi.fn(),
  updateEncryptedKeyRecord: vi.fn(),
  isPassphraseStorageEnabled: vi.fn(),
  setPassphraseStorageEnabled: vi.fn(),
}));

vi.mock('../../../services/pgpCryptoService.', () => ({
  pgpCryptoService: {
    changePassphrase: mocks.changePassphrase,
    extractKeyMetadata: mocks.extractKeyMetadata,
  },
}));

vi.mock('./keyRepository', () => ({
  addEncryptedKeyRecord: vi.fn(),
  createEncryptedUser: vi.fn(),
  deleteEncryptedKeyRecord: vi.fn(),
  getUserDecrypted: mocks.getUserDecrypted,
  getUserEncrypted: vi.fn(),
  updateEncryptedKeyRecord: mocks.updateEncryptedKeyRecord,
}));

vi.mock('../../security/services/securityService', () => ({
  securityService: {
    isPassphraseStorageEnabled: mocks.isPassphraseStorageEnabled,
    setPassphraseStorageEnabled: mocks.setPassphraseStorageEnabled,
  },
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const encrypted = {
  encryptedData: 'encrypted',
  iv: 'a'.repeat(24),
  salt: 'b'.repeat(32),
  tag: 'c'.repeat(32),
};

const key = (overrides: Partial<KeyPairWithRecordId> = {}): KeyPairWithRecordId => ({
  algorithm: 'RSA',
  bitStrength: 4096,
  expiry: 'never',
  fingerprint: 'fingerprint-1',
  isDefault: false,
  privateKey: 'private-key-1',
  privateKeyIsUnlocked: false,
  privateKeyPassphrase: null,
  publicKey: 'public-key-1',
  recordId: 'record-1',
  userId: 'User <user@example.test>',
  ...overrides,
});

const user = (keys: KeyPairWithRecordId[]): UserDecrypted => ({
  dekPassword: encrypted,
  dekSeed: encrypted,
  keys,
});

describe('PgPKeyService key record mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changePassphrase.mockResolvedValue('private-key-reencrypted');
    mocks.extractKeyMetadata.mockResolvedValue({
      algorithm: 'RSA',
      bitStrength: 4096,
      expiry: 'never',
      fingerprint: 'fingerprint-1',
      privateKeyIsUnlocked: false,
      userId: 'User <user@example.test>',
    });
    mocks.isPassphraseStorageEnabled.mockResolvedValue(false);
  });

  it('rewrites the encrypted key record with the new stored passphrase after changing passphrase', async () => {
    const existingKey = key({
      isDefault: true,
      privateKeyPassphrase: 'old-passphrase-123',
    });
    mocks.getUserDecrypted.mockResolvedValue(user([existingKey]));
    mocks.isPassphraseStorageEnabled.mockResolvedValue(true);
    const { PgPKeyService } = await import('./pgpKeyService');

    await PgPKeyService.changePassphrase(
      'user-1',
      existingKey.fingerprint,
      'old-passphrase-123',
      'new-passphrase-123',
      'new-passphrase-123',
    );

    expect(mocks.changePassphrase).toHaveBeenCalledWith(
      existingKey.privateKey,
      'old-passphrase-123',
      'new-passphrase-123',
    );
    expect(mocks.updateEncryptedKeyRecord).toHaveBeenCalledWith('user-1', {
      ...existingKey,
      privateKey: 'private-key-reencrypted',
      privateKeyPassphrase: 'new-passphrase-123',
    });
  });

  it('moves the default flag by updating the affected encrypted key records', async () => {
    const oldDefault = key({
      fingerprint: 'fingerprint-old',
      isDefault: true,
      recordId: 'record-old',
    });
    const nextDefault = key({
      fingerprint: 'fingerprint-next',
      isDefault: false,
      recordId: 'record-next',
    });
    mocks.getUserDecrypted.mockResolvedValue(user([oldDefault, nextDefault]));
    const { PgPKeyService } = await import('./pgpKeyService');

    await PgPKeyService.setDefaultKey('user-1', nextDefault.fingerprint);

    expect(mocks.updateEncryptedKeyRecord).toHaveBeenCalledTimes(2);
    expect(mocks.updateEncryptedKeyRecord).toHaveBeenNthCalledWith(1, 'user-1', {
      ...oldDefault,
      isDefault: false,
    });
    expect(mocks.updateEncryptedKeyRecord).toHaveBeenNthCalledWith(2, 'user-1', {
      ...nextDefault,
      isDefault: true,
    });
  });

  it('removes synced passphrases from key records before disabling passphrase storage', async () => {
    const stored = key({
      fingerprint: 'fingerprint-stored',
      privateKeyPassphrase: 'stored-passphrase',
      recordId: 'record-stored',
    });
    const withoutStoredPassphrase = key({
      fingerprint: 'fingerprint-empty',
      privateKeyPassphrase: null,
      recordId: 'record-empty',
    });
    const publicOnly = key({
      fingerprint: 'fingerprint-public',
      privateKey: null,
      privateKeyPassphrase: 'ignored-passphrase',
      recordId: 'record-public',
    });
    mocks.getUserDecrypted.mockResolvedValue(user([
      stored,
      withoutStoredPassphrase,
      publicOnly,
    ]));
    const { PgPKeyService } = await import('./pgpKeyService');

    await PgPKeyService.forgetStoredPassphrases('user-1');

    expect(mocks.updateEncryptedKeyRecord).toHaveBeenCalledTimes(1);
    expect(mocks.updateEncryptedKeyRecord).toHaveBeenCalledWith('user-1', {
      ...stored,
      privateKeyPassphrase: null,
    });
    expect(mocks.setPassphraseStorageEnabled).toHaveBeenCalledWith('user-1', false);
  });
});
