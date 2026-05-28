import type { KeyPair } from '../../../types/types';
import { identifyKeyType } from './pgpValidation';
import type { KeyAction } from '../model/types';

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
