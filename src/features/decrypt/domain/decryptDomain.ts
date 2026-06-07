import type { KeyPair } from '../../../types/types';
import type { KeySelectionMap } from '../model/types';

export function getFirstSelectedKeyId(keys: KeySelectionMap): string | null {
  const first = Object.keys(keys)[0];
  return first ?? null;
}

export function hasSelectedKeys(keys: KeySelectionMap): boolean {
  return Object.keys(keys).length > 0;
}

export function isPassphraseRequired(
  keys: KeyPair[] | undefined,
  selectedPrivateKey: KeySelectionMap,
): boolean {
  const selectedId = getFirstSelectedKeyId(selectedPrivateKey);
  if (!selectedId || !keys) return false;

  const keyPair = keys.find(key => key.fingerprint === selectedId);
  return Boolean(keyPair && keyPair.privateKeyIsUnlocked === false);
}
