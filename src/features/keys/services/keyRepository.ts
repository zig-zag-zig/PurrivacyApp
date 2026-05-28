import { ApiClient } from '../../../api/client';
import {
  EncryptionBase,
  KeyPair,
  KeyPairBase,
  UserCreatePayload,
  UserDecrypted,
  UserEncrypted,
} from '../../../types/types';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import { AuthService } from '../../auth/services/authService';
import { securityService } from '../../security/services/securityService';

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

const encryptRecords = async (records: object[], dek: string): Promise<EncryptionBase[]> => {
  const encryptedRecords: EncryptionBase[] = [];
  for (const record of records) {
    encryptedRecords.push(await AuthService.encrypt(record, dek));
  }
  return encryptedRecords;
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

export async function updateEncryptedKeys(userId: string, keys: KeyPair[]): Promise<void> {
  if (userId.trim() === '') return;

  const dek = await getAvailableDek(userId);
  const encryptedKeys = await encryptRecords(keys, dek);

  await ApiClient.updateKeys(encryptedKeys);
}

export async function getUserEncrypted(): Promise<UserEncrypted | null> {
  return ApiClient.get();
}

export async function getUserDecrypted(userId: string): Promise<UserDecrypted | null> {
  if (userId.trim() === '') return null;

  const userEncrypted = await getUserEncrypted();
  if (!userEncrypted) {
    return null;
  }

  const dek = await getAvailableDek(userId);
  const decryptedKeys: KeyPair[] = [];

  for (const key of userEncrypted.keys) {
    const decryptedKey = JSON.parse(
      await AuthService.decrypt(userId, key.encryptedData, dek, key.iv, false, key.tag),
    ) as KeyPairBase;

    const metadata = await pgpCryptoService.extractKeyMetadata(
      decryptedKey.privateKey || decryptedKey.publicKey,
    );

    decryptedKeys.push({
      ...metadata,
      publicKey: decryptedKey.publicKey,
      privateKey: decryptedKey.privateKey,
      isDefault: decryptedKey.isDefault,
    });
  }

  return { ...userEncrypted, keys: decryptedKeys };
}
