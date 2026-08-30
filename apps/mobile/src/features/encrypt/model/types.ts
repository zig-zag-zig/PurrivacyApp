import type { KeyPair } from '../../../types/types';
import type { KeySelectionMap } from '../../keys/model/keySelectionTypes';

export type { KeySelectionMap };

export interface EncryptUiState {
  content: string;
  isEncrypting: boolean;
  encryptedContent: string;
  selectedPrivateKey: KeySelectionMap;
  selectedPublicKeys: KeySelectionMap;
  passphrase: string;
  formErrors: Record<string, string>;
  includePublicKey: boolean;
  signMessage: boolean;
  wasSuccessful: boolean;
  signature: string;
  completeKeyPairs: KeyPair[];
  passphraseIsRequired: boolean;
}
