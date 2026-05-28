import { ENV } from '../../../config/env';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import type { KeyPair } from '../../../types/types';
import { storage } from '../../../utils/storage';
import { logger } from '../../../utils/logger';

type CachedTempKeyPayload = {
  version: number;
  generatedCount: number;
  keys: KeyPair[];
};

const CACHE_VERSION = 3;
const CACHE_KEY = 'dev-real-pgp-temp-keys';
const DEV_TEMP_EMAIL_DOMAIN = 'purrivacy.local';
const DEV_TEMP_KEY_PASSPHRASE = 'testpassword';

let cachedTempKeys: KeyPair[] | null = null;
let loadTempKeysPromise: Promise<KeyPair[]> | null = null;
let generatedTempKeyCount = 0;

function getTempKeyLabel(index: number): string {
  const padded = index.toString().padStart(2, '0');

  if (index % 9 === 0) return `Temporary Archive Recovery Key ${padded}`;
  if (index % 7 === 0) return `Personal Signing Key ${padded}`;

  return `Temp Key ${padded}`;
}

function getTempKeyEmail(index: number): string {
  return `temp${index.toString().padStart(2, '0')}@${DEV_TEMP_EMAIL_DOMAIN}`;
}

function isPublicOnlyTempKey(index: number, totalCount: number): boolean {
  return totalCount > 1 && (index % 3 === 0 || (totalCount < 3 && index === totalCount));
}

function normalizeCachedKeys(value: unknown): CachedTempKeyPayload {
  const payload = value as Partial<CachedTempKeyPayload> | null;
  if (!payload || payload.version !== CACHE_VERSION || !Array.isArray(payload.keys)) {
    return { version: CACHE_VERSION, generatedCount: 0, keys: [] };
  }

  const keys = payload.keys.filter(key => (
    typeof key.publicKey === 'string'
    && key.publicKey.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')
    && (
      key.privateKey === null
      || (
        typeof key.privateKey === 'string'
        && key.privateKey.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')
      )
    )
  ));

  return {
    version: CACHE_VERSION,
    generatedCount: Math.max(payload.generatedCount ?? keys.length, keys.length),
    keys,
  };
}

async function persistTempKeys(keys: KeyPair[], generatedCount = generatedTempKeyCount): Promise<void> {
  generatedTempKeyCount = Math.max(generatedCount, keys.length);
  cachedTempKeys = keys;

  await storage.setItem(CACHE_KEY, {
    version: CACHE_VERSION,
    generatedCount: generatedTempKeyCount,
    keys,
  } satisfies CachedTempKeyPayload);
}

async function createRealTempKey(index: number, totalCount: number): Promise<KeyPair> {
  const label = getTempKeyLabel(index);
  const { publicKey, privateKey } = await pgpCryptoService.generateKeyPair({
    algorithm: 'EDDSA',
    bitStrength: 3072,
    name: label,
    email: getTempKeyEmail(index),
    comment: 'Purrivacy dev temp key',
    passphrase: DEV_TEMP_KEY_PASSPHRASE,
    days: 0,
  });
  const metadata = await pgpCryptoService.extractKeyMetadata(publicKey);
  const publicOnly = isPublicOnlyTempKey(index, totalCount);

  return {
    ...metadata,
    publicKey,
    privateKey: publicOnly ? null : privateKey,
    privateKeyIsUnlocked: publicOnly ? undefined : false,
    isDefault: false,
  };
}

async function createMissingTempKeys(
  existingKeys: KeyPair[],
  generatedCount: number,
  count: number,
): Promise<KeyPair[]> {
  const keys = [...existingKeys];

  for (let index = generatedCount + 1; index <= count; index += 1) {
    keys.push(await createRealTempKey(index, count));
    await persistTempKeys(keys, index);
  }

  return keys;
}

async function loadOrCreateKeys(): Promise<KeyPair[]> {
  if (!__DEV__ || ENV.devTempKeyCount <= 0) {
    cachedTempKeys = [];
    return [];
  }

  if (cachedTempKeys && cachedTempKeys.length >= ENV.devTempKeyCount) {
    return cachedTempKeys.slice(0, ENV.devTempKeyCount);
  }

  const cachedPayload = normalizeCachedKeys(await storage.getItem(CACHE_KEY));
  generatedTempKeyCount = cachedPayload.generatedCount;
  const keys = await createMissingTempKeys(
    cachedPayload.keys,
    cachedPayload.generatedCount,
    ENV.devTempKeyCount,
  );
  await persistTempKeys(keys, Math.max(generatedTempKeyCount, ENV.devTempKeyCount));

  return keys;
}

export function isDevTempKeyFingerprint(fingerprint: string): boolean {
  return __DEV__ && Boolean(cachedTempKeys?.some(tempKey => tempKey.fingerprint === fingerprint));
}

export function isDevTempKey(key: Pick<KeyPair, 'fingerprint' | 'userId'>): boolean {
  return __DEV__ && (
    key.fingerprint.startsWith('TEMP-DEMO-')
    || isDevTempKeyFingerprint(key.fingerprint)
    || new RegExp(`<temp\\d+@${DEV_TEMP_EMAIL_DOMAIN.replace('.', '\\.')}>`, 'i').test(key.userId)
  );
}

function getDevTempKeys(): KeyPair[] {
  if (!__DEV__ || ENV.devTempKeyCount <= 0) {
    return [];
  }

  return cachedTempKeys?.slice(0, ENV.devTempKeyCount) ?? [];
}

export async function loadDevTempKeys(): Promise<KeyPair[]> {
  if (cachedTempKeys !== null) {
    return getDevTempKeys();
  }

  if (!loadTempKeysPromise) {
    loadTempKeysPromise = loadOrCreateKeys().catch(error => {
      logger.warn('failed to load dev temp keys', { error });
      cachedTempKeys = [];
      loadTempKeysPromise = null;
      return [];
    });
  }

  return loadTempKeysPromise;
}

async function getLoadedTempKeys(): Promise<KeyPair[]> {
  if (!__DEV__ || ENV.devTempKeyCount <= 0) {
    return [];
  }

  if (!cachedTempKeys) {
    await loadDevTempKeys();
  }

  return cachedTempKeys ?? [];
}

function assignFallbackDefault(keys: KeyPair[]): void {
  if (keys.some(key => key.isDefault && key.privateKey)) {
    return;
  }

  const nextDefault = keys.find(key => key.privateKey);
  if (nextDefault) {
    nextDefault.isDefault = true;
  }
}

export async function deleteDevTempKey(fingerprint: string): Promise<void> {
  const keys = await getLoadedTempKeys();
  const index = keys.findIndex(key => key.fingerprint === fingerprint);
  if (index < 0) {
    throw new Error('Test key not found');
  }

  const [removed] = keys.splice(index, 1);
  if (removed?.isDefault) {
    assignFallbackDefault(keys);
  }

  await persistTempKeys(keys);
}

export async function setDefaultDevTempKey(fingerprint: string): Promise<void> {
  const keys = await getLoadedTempKeys();
  const target = keys.find(key => key.fingerprint === fingerprint);

  if (!target?.privateKey) {
    throw new Error('Cannot set a public-only key as default');
  }

  keys.forEach(key => {
    key.isDefault = key.fingerprint === fingerprint;
  });

  await persistTempKeys(keys);
}

export async function clearDevTempKeyDefault(): Promise<void> {
  const keys = await getLoadedTempKeys();
  if (keys.length === 0 || !keys.some(key => key.isDefault)) {
    return;
  }

  keys.forEach(key => {
    key.isDefault = false;
  });

  await persistTempKeys(keys);
}

export async function changeDevTempKeyPassphrase(
  fingerprint: string,
  oldPassphrase: string,
  newPassphrase: string,
  newPassphraseConfirm: string,
): Promise<KeyPair> {
  if (newPassphrase !== newPassphraseConfirm) {
    throw new Error('The password confirmation failed');
  }
  if (newPassphrase === oldPassphrase) {
    throw new Error('The current and new passwords must be different');
  }

  const keys = await getLoadedTempKeys();
  const index = keys.findIndex(key => key.fingerprint === fingerprint);
  const key = keys[index];

  if (!key?.privateKey) {
    throw new Error('Private key not found');
  }

  const privateKey = await pgpCryptoService.changePassphrase(
    key.privateKey,
    oldPassphrase,
    newPassphrase,
  );
  const metadata = await pgpCryptoService.extractKeyMetadata(privateKey);
  const updatedKey: KeyPair = {
    ...key,
    ...metadata,
    publicKey: key.publicKey,
    privateKey,
    privateKeyIsUnlocked: metadata.privateKeyIsUnlocked,
    isDefault: key.isDefault,
  };

  keys[index] = updatedKey;
  await persistTempKeys(keys);

  return updatedKey;
}

export async function changeDevTempKeyExpiration(
  fingerprint: string,
  passphrase: string,
  days: string,
): Promise<KeyPair> {
  const keys = await getLoadedTempKeys();
  const index = keys.findIndex(key => key.fingerprint === fingerprint);
  const key = keys[index];

  if (!key?.privateKey) {
    throw new Error('Private key not found');
  }

  const result = await pgpCryptoService.changeExpiration(key.privateKey, passphrase, days);
  const metadata = await pgpCryptoService.extractKeyMetadata(result.privateKey);
  const updatedKey: KeyPair = {
    ...key,
    ...metadata,
    publicKey: result.publicKey,
    privateKey: result.privateKey,
    privateKeyIsUnlocked: metadata.privateKeyIsUnlocked,
    isDefault: key.isDefault,
  };

  keys[index] = updatedKey;
  await persistTempKeys(keys);

  return updatedKey;
}

export function appendDevTempKeys(
  keys: KeyPair[] | undefined,
  tempKeys: KeyPair[] = getDevTempKeys(),
): KeyPair[] {
  if (tempKeys.length === 0) {
    return keys ?? [];
  }

  const existingFingerprints = new Set((keys ?? []).map(key => key.fingerprint));
  const filteredTempKeys = tempKeys.filter(key => !existingFingerprints.has(key.fingerprint));
  const hasTempDefault = filteredTempKeys.some(key => key.isDefault && key.privateKey);
  const visibleUserKeys = hasTempDefault
    ? (keys ?? []).map(key => key.isDefault ? { ...key, isDefault: false } : key)
    : (keys ?? []);

  return [
    ...visibleUserKeys,
    ...filteredTempKeys,
  ];
}
