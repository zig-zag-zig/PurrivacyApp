import type { KeyPair } from '../../../types/types';
import { identifyKeyType } from './pgpValidation';
import type { KeyAction } from '../model/types';

/**
 * Merges real keys from the backend with optimistic keys that haven't appeared yet.
 * Filters out keys optimistically marked for removal.
 * Once a key's fingerprint exists in the real list, the optimistic copy is dropped.
 */
export function mergeOptimisticKeys(
  realKeys: KeyPair[],
  optimisticKeys: KeyPair[],
  optimisticRemovedFingerprints: string[] = [],
): KeyPair[] {
  const realFingerprints = new Set(realKeys.map(k => k.fingerprint));
  const removedFingerprints = new Set(optimisticRemovedFingerprints);
  const pending = optimisticKeys.filter(k => !realFingerprints.has(k.fingerprint));
  const merged = [...realKeys, ...pending];
  return merged.filter(k => !removedFingerprints.has(k.fingerprint));
}

export function sortKeysForView(keys: KeyPair[]): KeyPair[] {
  const defaultKey = keys.find(key => key.isDefault && key.privateKey);
  const completePairs = keys.filter(key => key.privateKey && key.publicKey && !key.isDefault);
  const publicOnly = keys.filter(key => !key.privateKey);

  return [
    ...(defaultKey ? [defaultKey] : []),
    ...completePairs,
    ...publicOnly,
  ];
}

export function hasExistingDefaultKeyPair(keys: KeyPair[] | undefined): boolean {
  return keys?.some(key => key.isDefault && key.privateKey) ?? false;
}

export function getRouteKeyAction(action: 'create' | 'import' | undefined): KeyAction {
  if (action === 'create') return 'create';
  if (action === 'import') return 'import';
  return 'view';
}

export function isImportKeyValid(importKey: string): boolean {
  const keyType = identifyKeyType(importKey.trim());
  return keyType === 'public' || keyType === 'private';
}
