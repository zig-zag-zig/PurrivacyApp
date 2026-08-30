import type { KeyPair } from '../../../types/types';
import type { KeySelectionMap } from '../model/types';
import {
  getFirstSelectedKeyId,
  hasSelectedKeys,
} from '../../keys/domain/keySelectionUtils';

export { getFirstSelectedKeyId, hasSelectedKeys };

export function isPassphraseRequired(
  keys: KeyPair[] | undefined,
  selectedPrivateKey: KeySelectionMap,
): boolean {
  const selectedId = getFirstSelectedKeyId(selectedPrivateKey);
  if (!selectedId || !keys) return false;

  const keyPair = keys.find(key => key.fingerprint === selectedId);
  return Boolean(keyPair && keyPair.privateKeyIsUnlocked === false);
}
