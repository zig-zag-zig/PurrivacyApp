import type { KeySelectionMap } from '../../keys/model/keySelectionTypes';

export type SignatureStatus = 'valid' | 'invalid' | 'unknown';

export type { KeySelectionMap };

type DecryptFormErrors = Record<string, string>;

export interface DecryptUiState {
  encryptedContent: string;
  decryptedContent: string;
  isDecrypting: boolean;
  selectedPrivateKey: KeySelectionMap;
  selectedPublicKeys: KeySelectionMap;
  passphrase: string;
  formErrors: DecryptFormErrors;
  wasSuccessful: boolean;
  signature: string;
  embeddedSignatureStatus: SignatureStatus;
  detachedSignatureStatus: SignatureStatus;
  useDetachedVerification: boolean;
  passphraseIsRequired: boolean;
}
