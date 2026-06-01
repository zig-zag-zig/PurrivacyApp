import type { KeyGenerationOptions, KeyPair, UserDecrypted } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { validatePassphrase } from '../../../utils/validation';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import { identifyKeyType } from '../domain/pgpValidation';
import { getUserDecrypted, updateEncryptedKeys } from './keyRepository';

const upsertKeyPair = async (
  userId: string,
  publicKey: string,
  privateKey: string | null,
  setAsDefault?: boolean,
): Promise<KeyPair | null> => {
  if (!publicKey) throw new Error('Public key is required');

  const metadata = await pgpCryptoService.extractKeyMetadata(publicKey);
  const user: UserDecrypted | null = await getUserDecrypted(userId);
  if (!user) return null;

  const existingPairIndex = user.keys.findIndex(key => key.fingerprint === metadata.fingerprint);
  const isCompletePair = Boolean(privateKey && publicKey);
  const hasExistingDefault = user.keys.some(key => key.isDefault && key.privateKey);
  const isDefault = Boolean(
    setAsDefault === true || (setAsDefault !== false && isCompletePair && !hasExistingDefault),
  );

  const key: KeyPair = {
    ...metadata,
    publicKey,
    privateKey,
    isDefault,
  };

  if (existingPairIndex > -1) {
    const existingKey = user.keys[existingPairIndex];
    user.keys[existingPairIndex] = {
      ...key,
      isDefault: key.isDefault || existingKey.isDefault,
    };
  } else {
    user.keys.push(key);
  }

  if (key.isDefault && isCompletePair) {
    user.keys.forEach(existingKey => {
      if (existingKey.fingerprint !== key.fingerprint) {
        existingKey.isDefault = false;
      }
    });
  }

  await updateEncryptedKeys(userId, user.keys);
  return user.keys.find(existingKey => existingKey.fingerprint === key.fingerprint) || null;
};

export async function createKey(
  userId: string,
  keyGenerationOptions: KeyGenerationOptions,
  setAsDefault?: boolean,
): Promise<KeyPair | null> {
  try {
    const { privateKey, publicKey } = await pgpCryptoService.generateKeyPair(keyGenerationOptions);
    return await upsertKeyPair(userId, publicKey, privateKey, setAsDefault);
  } catch (error) {
    logger.warn('key create failed', { error });
    throw new Error('Failed to create key pair');
  }
}

export async function importKey(
  userId: string,
  armoredKey: string,
  linkedArmoredKey: string | null = null,
  setAsDefault?: boolean,
): Promise<KeyPair | null> {
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
      return await upsertKeyPair(userId, publicKey, armoredKey, setAsDefault);
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

    const keyIndex = user.keys.findIndex(existingKey => existingKey.fingerprint === key.fingerprint);
    if (keyIndex < 0) return;

    const wasDefault = user.keys[keyIndex].isDefault;
    user.keys.splice(keyIndex, 1);

    if (wasDefault) {
      const firstCompletePair = user.keys.find(existingKey => existingKey.privateKey);
      if (firstCompletePair) {
        firstCompletePair.isDefault = true;
      }
    }

    await updateEncryptedKeys(userId, user.keys);
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

    key.privateKey = await pgpCryptoService.changePassphrase(
      key.privateKey!,
      oldPassphrase,
      newPassphrase,
    );

    await updateEncryptedKeys(userId, user.keys);
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

    key.privateKey = result.privateKey;
    key.publicKey = result.publicKey;

    await updateEncryptedKeys(userId, user.keys);
  } catch (error: any) {
    logger.warn('key expiration change failed', { error });
    throw new Error(error.message || 'Failed to change expiration');
  }
}

export async function setDefaultKey(userId: string, fingerprint: string): Promise<void> {
  try {
    const user = await getUserDecrypted(userId);
    if (!user) return;

    user.keys.forEach(key => {
      key.isDefault = false;
    });

    const targetKey = user.keys.find(key => key.fingerprint === fingerprint);
    if (!targetKey?.privateKey) {
      throw new Error('Cannot set incomplete key pair as default');
    }

    targetKey.isDefault = true;
    await updateEncryptedKeys(userId, user.keys);
  } catch (error) {
    logger.warn('default key update failed', { error });
    throw new Error('Failed to set default key');
  }
}
