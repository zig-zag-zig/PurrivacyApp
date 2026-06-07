import type { KeyPair } from '../../../types/types';
import type { KeySelectionMap } from '../model/types';

export function getFirstSelectedKeyId(keys: KeySelectionMap): string | null {
  const keyId = Object.keys(keys)[0];
  return keyId ?? null;
}

export function isPassphraseRequired(
  keyPair: KeyPair | undefined,
  signMessage: boolean,
  selectedPrivateKeys: KeySelectionMap,
): boolean {
  return Boolean(
    keyPair
    && keyPair.privateKeyIsUnlocked === false
    && signMessage
    && Object.keys(selectedPrivateKeys).length > 0,
  );
}

export function normalizeSelectedPublicKeys(
  current: KeySelectionMap,
  next: KeySelectionMap,
): KeySelectionMap {
  if (Object.keys(current).length === 1 && Object.keys(next).length === 0) {
    return current;
  }

  return next;
}
