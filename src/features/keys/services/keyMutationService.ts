import type {
  KeyGenerationOptions,
  KeyPair,
  KeyPairWithRecordId,
  UserDecrypted,
} from '../../../types/types';
import { logger } from '../../../utils/logger';
import { validatePassphrase } from '../../../utils/validation';
import { pgpCryptoService } from '../../../services/pgpCryptoService';
import { identifyKeyType } from '../domain/pgpValidation';
import {
  addEncryptedKeyRecord,
  deleteEncryptedKeyRecord,
  getUserDecrypted,
  updateEncryptedKeyRecord,
} from './keyRepository';
import { securityService } from '../../security/services/securityService';

const findKeyByFingerprint = (
  user: UserDecrypted,
  fingerprint: string,
): KeyPairWithRecordId | undefined => user.keys.find(key => key.fingerprint === fingerprint);

const shouldSyncPassphrase = async (
  userId: string,
  passphrase: string | null | undefined,
): Promise<string | null> => {
  if (!passphrase) return null;
  return await securityService.isPassphraseStorageEnabled(userId) ? passphrase : null;
};

const clearDefaultKeyRecords = async (
  userId: string,
  user: UserDecrypted,
  exceptRecordId?: string,
): Promise<void> => {
  const defaultsToClear = user.keys.filter(key => (
    key.isDefault && key.recordId !== exceptRecordId
  ));

  for (const key of defaultsToClear) {
    await updateEncryptedKeyRecord(userId, {
      ...key,
      isDefault: false,
    });
  }
};

const upsertKeyPair = async (
  userId: string,
  publicKey: string,
  privateKey: string | null,
  setAsDefault?: boolean,
  privateKeyPassphrase?: string | null,
): Promise<KeyPairWithRecordId | null> => {
  if (!publicKey) throw new Error('Public key is required');

  const metadata = await pgpCryptoService.extractKeyMetadata(publicKey);
  const user: UserDecrypted | null = await getUserDecrypted(userId);
  if (!user) return null;

  const existingPair = findKeyByFingerprint(user, metadata.fingerprint);
  const isCompletePair = Boolean(privateKey && publicKey);
  const hasExistingDefault = user.keys.some(key => key.isDefault && key.privateKey);
  const shouldSetDefault = isCompletePair && Boolean(
    setAsDefault === true || (setAsDefault !== false && !hasExistingDefault),
  );
  const syncedPassphrase = privateKey
    ? privateKeyPassphrase ?? existingPair?.privateKeyPassphrase ?? null
    : null;

  const key: KeyPair = {
    ...metadata,
    publicKey,
    privateKey,
    isDefault: Boolean(existingPair?.isDefault || shouldSetDefault),
    privateKeyPassphrase: syncedPassphrase,
  };

  if (shouldSetDefault) {
    await clearDefaultKeyRecords(userId, user, existingPair?.recordId);
  }

  const savedKey = existingPair
    ? { ...key, recordId: existingPair.recordId }
    : await addEncryptedKeyRecord(userId, key);

  if (existingPair) {
    await updateEncryptedKeyRecord(userId, savedKey);
  }

  return savedKey;
};

export async function createKey(
  userId: string,
  keyGenerationOptions: KeyGenerationOptions,
  setAsDefault?: boolean,
  privateKeyPassphrase?: string | null,
): Promise<KeyPairWithRecordId | null> {
  let stage = 'generateKeyPair';

  try {
    const { privateKey, publicKey } =
      await pgpCryptoService.generateKeyPair(keyGenerationOptions);

    stage = 'upsertKeyPair';

    return await upsertKeyPair(
      userId,
      publicKey,
      privateKey,
      setAsDefault,
      privateKeyPassphrase,
    );
  } catch (error: any) {
    logger.warn('key create failed', {
      stage,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      status: error?.status,
      response: error?.response,
      error,
    });

    throw new Error(
      stage === 'generateKeyPair'
        ? 'Failed to generate key pair'
        : `Failed to save key pair: ${error?.message || 'unknown error'}`
    );
  }
}

export async function importKey(
  userId: string,
  armoredKey: string,
  linkedArmoredKey: string | null = null,
  setAsDefault?: boolean,
  privateKeyPassphrase?: string | null,
): Promise<KeyPairWithRecordId | null> {
  try {
    const keyType = identifyKeyType(armoredKey);

    if (keyType === 'unknown') {
      throw new Error('Invalid key format. Must be a valid PGP public or private key.');
    }

    if (keyType === 'message') {
      throw new Error('Cannot import encrypted messages as keys.');
    }

    if (keyType === 'private') {
      const publicKey = linkedArmoredKey
        ? linkedArmoredKey
        : await pgpCryptoService.extractPublicKeyFromPrivate(armoredKey);
      return await upsertKeyPair(
        userId,
        publicKey,
        armoredKey,
        setAsDefault,
        privateKeyPassphrase,
      );
    }

    return await upsertKeyPair(userId, armoredKey, linkedArmoredKey, setAsDefault);
  } catch (error: any) {
    logger.warn('key import failed', { error });
    throw new Error(`Key import failed: ${error.message}`);
  }
}

export async function deleteKey(userId: string, key: KeyPair): Promise<void> {
  try {
    const user = await getUserDecrypted(userId);
    if (!user) return;

    const keyToDelete = findKeyByFingerprint(user, key.fingerprint);
    if (!keyToDelete) return;

    const nextDefault = keyToDelete.isDefault
      ? user.keys.find(existingKey => (
        existingKey.recordId !== keyToDelete.recordId && existingKey.privateKey
      ))
      : undefined;

    await deleteEncryptedKeyRecord(keyToDelete.recordId);

    if (nextDefault) {
      await updateEncryptedKeyRecord(userId, {
        ...nextDefault,
        isDefault: true,
      });
    }
  } catch (error: any) {
    logger.warn('key delete failed', { error });
    throw new Error(error.message || 'Failed to delete key');
  }
}

export async function changePassphrase(
  userId: string,
  fingerprint: string,
  oldPassphrase: string,
  newPassphrase: string,
  newPassphraseConfirm: string,
): Promise<void> {
  try {
    if (userId.trim() === '') throw new Error('userId cannot be empty');
    if (newPassphrase !== newPassphraseConfirm) throw new Error('The password confirmation failed');
    const passphraseValidation = validatePassphrase(newPassphrase);
    if (!passphraseValidation.isValid) throw new Error(passphraseValidation.error);
    if (newPassphrase === oldPassphrase) {
      throw new Error('The current and new passwords must be different');
    }

    const user = await getUserDecrypted(userId);
    if (!user) throw new Error('User not found');

    const key = user.keys.find(existingKey => existingKey.fingerprint === fingerprint && existingKey.privateKey);
    if (!key) throw new Error('Private key not found');

    const privateKey = await pgpCryptoService.changePassphrase(
      key.privateKey!,
      oldPassphrase,
      newPassphrase,
    );
    const metadata = await pgpCryptoService.extractKeyMetadata(privateKey);

    await updateEncryptedKeyRecord(userId, {
      ...key,
      ...metadata,
      privateKey,
      privateKeyPassphrase: await shouldSyncPassphrase(userId, newPassphrase),
    });
  } catch (error: any) {
    logger.warn('key passphrase change failed', { error });
    throw new Error(error.message || 'Failed to change passphrase');
  }
}

export async function changeExpiration(
  userId: string,
  fingerprint: string,
  passphrase: string,
  days: string,
): Promise<void> {
  try {
    const user = await getUserDecrypted(userId);
    if (!user) throw new Error('User not found');

    const key = user.keys.find(existingKey => existingKey.fingerprint === fingerprint && existingKey.privateKey);
    if (!key) throw new Error('Private key not found');

    const result = await pgpCryptoService.changeExpiration(key.privateKey!, passphrase, days);
    const metadata = await pgpCryptoService.extractKeyMetadata(result.privateKey);

    await updateEncryptedKeyRecord(userId, {
      ...key,
      ...metadata,
      privateKey: result.privateKey,
      publicKey: result.publicKey,
      privateKeyPassphrase: await shouldSyncPassphrase(
        userId,
        key.privateKeyPassphrase ?? passphrase,
      ),
    });
  } catch (error: any) {
    logger.warn('key expiration change failed', { error });
    throw new Error(error.message || 'Failed to change expiration');
  }
}

export async function setDefaultKey(userId: string, fingerprint: string): Promise<void> {
  try {
    const user = await getUserDecrypted(userId);
    if (!user) return;

    const targetKey = findKeyByFingerprint(user, fingerprint);
    if (!targetKey?.privateKey) {
      throw new Error('Cannot set incomplete key pair as default');
    }

    await clearDefaultKeyRecords(userId, user, targetKey.recordId);
    if (!targetKey.isDefault) {
      await updateEncryptedKeyRecord(userId, {
        ...targetKey,
        isDefault: true,
      });
    }
  } catch (error) {
    logger.warn('default key update failed', { error });
    throw new Error('Failed to set default key');
  }
}

export async function storeSyncedPassphrase(
  userId: string,
  fingerprint: string,
  passphrase: string,
): Promise<void> {
  try {
    if (!await securityService.isPassphraseStorageEnabled(userId)) return;
    if (!passphrase) return;

    const user = await getUserDecrypted(userId);
    if (!user) return;

    const key = user.keys.find(existingKey => existingKey.fingerprint === fingerprint && existingKey.privateKey);
    if (!key) return;

    await updateEncryptedKeyRecord(userId, {
      ...key,
      privateKeyPassphrase: passphrase,
    });
  } catch (error) {
    logger.warn('synced passphrase store failed', { error });
  }
}

export async function forgetStoredPassphrases(userId: string): Promise<void> {
  if (userId.trim() === '') return;

  const user = await getUserDecrypted(userId);
  if (user) {
    const keysWithSyncedPassphrases = user.keys.filter(key => (
      key.privateKey && key.privateKeyPassphrase
    ));

    for (const key of keysWithSyncedPassphrases) {
      await updateEncryptedKeyRecord(userId, {
        ...key,
        privateKeyPassphrase: null,
      });
    }
  }

  await securityService.setPassphraseStorageEnabled(userId, false);
}
