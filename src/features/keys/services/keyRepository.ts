import { ApiClient } from '../../../api/client';
import {
  EncryptionBase,
  KeyPair,
  KeyPairBase,
  KeyPairWithRecordId,
  UserCreatePayload,
  UserDecrypted,
  UserEncrypted,
} from '../../../types/types';
import type { KeyMetadata } from '../../../types/types';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import { AuthService } from '../../auth/services/authService';
import { securityService } from '../../security/services/securityService';

type DecryptedKeyPayload = Partial<KeyMetadata> & KeyPairBase;
type StorageKeyPayload = KeyPair & {
  privateKeyPassphrase?: string | null;
};

const getAvailableDek = async (userId: string, providedDek?: string): Promise<string> => {
  if (providedDek && providedDek.trim().length > 0) {
    return providedDek;
  }

  const storedDek = await securityService.getDek(userId);
  if (!storedDek || storedDek.trim().length === 0) {
    throw new Error('Data encryption key not found in secure storage');
  }

  return storedDek;
};

const normalizeKeyBeforeEncryption = (key: KeyPair): StorageKeyPayload => {
  const keyWithPossibleRecordId = key as KeyPairWithRecordId;
  const { recordId: _recordId, ...payload } = keyWithPossibleRecordId;

  return {
    ...payload,
    privateKeyPassphrase:
      key.privateKey !== null ? key.privateKeyPassphrase ?? null : null,
  };
};

const encryptKeyRecord = async (
  userId: string,
  key: KeyPair,
  providedDek?: string,
): Promise<EncryptionBase> => {
  const dek = await getAvailableDek(userId, providedDek);
  return AuthService.encrypt(normalizeKeyBeforeEncryption(key), dek);
};

const encryptRecords = async (records: object[], dek: string): Promise<EncryptionBase[]> => {
  const encryptedRecords: EncryptionBase[] = [];
  for (const record of records) {
    encryptedRecords.push(await AuthService.encrypt(record, dek));
  }
  return encryptedRecords;
};

const syncLocalPassphraseCacheFromPayload = async (
  userId: string,
  key: KeyPairWithRecordId,
): Promise<void> => {
  if (!key.privateKey) return;

  if (key.privateKeyPassphrase) {
    await securityService.storePassphrase(
      userId,
      { [key.fingerprint]: key.privateKeyPassphrase },
      key.fingerprint,
    );
    return;
  }

  await securityService.clearPassphrase(userId, key.fingerprint);
};

export async function createEncryptedUser(
  userId: string,
  userDecrypted: UserCreatePayload,
  dek: string,
): Promise<void> {
  if (userId.trim() === '') return;

  const resolvedDek = await getAvailableDek(userId, dek);
  const encryptedKeys = await encryptRecords(userDecrypted.keys, resolvedDek);

  await ApiClient.create({ ...userDecrypted, keys: encryptedKeys });
  await securityService.setDek(userId, resolvedDek);
}

export async function addEncryptedKeyRecord(
  userId: string,
  key: KeyPair,
): Promise<KeyPairWithRecordId> {
  if (userId.trim() === '') throw new Error('userId cannot be empty');

  const encryptedKey = await encryptKeyRecord(userId, key);

  const saved = await ApiClient.addKeyRecord(encryptedKey);

  return {
    ...key,
    recordId: saved.recordId,
  };
}

export async function updateEncryptedKeyRecord(
  userId: string,
  key: KeyPairWithRecordId,
): Promise<void> {
  if (userId.trim() === '') throw new Error('userId cannot be empty');
  if (!key.recordId) throw new Error('recordId is required');

  const encryptedKey = await encryptKeyRecord(userId, key);
  await ApiClient.updateKeyRecord(key.recordId, encryptedKey);
}

export async function deleteEncryptedKeyRecord(recordId: string): Promise<void> {
  await ApiClient.deleteKeyRecord(recordId);
}

export async function getUserEncrypted(): Promise<UserEncrypted | null> {
  return await ApiClient.get();
}

export async function getUserDecrypted(userId: string): Promise<UserDecrypted | null> {
  if (userId.trim() === '') return null;

  const userEncrypted = await getUserEncrypted();
  if (!userEncrypted) {
    return null;
  }

  const keyRecords = await ApiClient.getKeyRecords();
  const dek = await getAvailableDek(userId);
  const decryptedKeys: KeyPairWithRecordId[] = [];

  for (const keyRecord of keyRecords.keys) {
    const decryptedKey = JSON.parse(
      await AuthService.decrypt(userId, keyRecord.encryptedData, dek, keyRecord.iv, false, keyRecord.tag),
    ) as DecryptedKeyPayload;

    const privateKey = decryptedKey.privateKey ?? null;
    const publicKey = decryptedKey.publicKey;
    if (!publicKey) {
      throw new Error('Encrypted key payload is missing publicKey');
    }

    const metadata = await pgpCryptoService.extractKeyMetadata(
      privateKey || publicKey,
    );
    const key: KeyPairWithRecordId = {
      ...metadata,
      publicKey,
      privateKey,
      isDefault: decryptedKey.isDefault === true,
      recordId: keyRecord.recordId,
      privateKeyPassphrase:
        privateKey !== null ? decryptedKey.privateKeyPassphrase ?? null : null,
    };

    decryptedKeys.push(key);
    await syncLocalPassphraseCacheFromPayload(userId, key);
  }

  return { ...userEncrypted, keys: decryptedKeys };
}
