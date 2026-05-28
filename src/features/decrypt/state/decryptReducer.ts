import type { DecryptUiState, KeySelectionMap, SignatureStatus } from '../model/types';

type DecryptAction =
  | { type: 'encryptedContentChanged'; content: string }
  | { type: 'decryptedContentSet'; content: string }
  | { type: 'decryptStarted' }
  | { type: 'decryptFinished' }
  | { type: 'selectedPrivateKeyChanged'; selectedPrivateKey: KeySelectionMap }
  | { type: 'selectedPublicKeysChanged'; selectedPublicKeys: KeySelectionMap }
  | { type: 'passphraseChanged'; passphrase: string }
  | { type: 'formErrorsChanged'; formErrors: Record<string, string> }
  | { type: 'markSuccessful' }
  | { type: 'signatureChanged'; signature: string }
  | { type: 'embeddedSignatureStatusChanged'; status: SignatureStatus }
  | { type: 'detachedSignatureStatusChanged'; status: SignatureStatus }
  | { type: 'useDetachedVerificationChanged'; enabled: boolean }
  | { type: 'passphraseRequiredChanged'; required: boolean }
  | { type: 'resetAfterSuccess' };

export const initialDecryptState: DecryptUiState = {
  encryptedContent: '',
  decryptedContent: '',
  isDecrypting: false,
  selectedPrivateKey: {},
  selectedPublicKeys: {},
  passphrase: '',
  formErrors: {},
  wasSuccessful: false,
  signature: '',
  embeddedSignatureStatus: 'unknown',
  detachedSignatureStatus: 'unknown',
  useDetachedVerification: false,
  passphraseIsRequired: false,
};

export function decryptReducer(state: DecryptUiState, action: DecryptAction): DecryptUiState {
  switch (action.type) {
    case 'encryptedContentChanged':
      return { ...state, encryptedContent: action.content };
    case 'decryptedContentSet':
      return { ...state, decryptedContent: action.content };
    case 'decryptStarted':
      return { ...state, isDecrypting: true };
    case 'decryptFinished':
      return { ...state, isDecrypting: false };
    case 'selectedPrivateKeyChanged':
      return { ...state, selectedPrivateKey: action.selectedPrivateKey };
    case 'selectedPublicKeysChanged':
      return { ...state, selectedPublicKeys: action.selectedPublicKeys };
    case 'passphraseChanged':
      return { ...state, passphrase: action.passphrase };
    case 'formErrorsChanged':
      return { ...state, formErrors: action.formErrors };
    case 'markSuccessful':
      return { ...state, wasSuccessful: true };
    case 'signatureChanged':
      return { ...state, signature: action.signature };
    case 'embeddedSignatureStatusChanged':
      return { ...state, embeddedSignatureStatus: action.status };
    case 'detachedSignatureStatusChanged':
      return { ...state, detachedSignatureStatus: action.status };
    case 'useDetachedVerificationChanged':
      return { ...state, useDetachedVerification: action.enabled };
    case 'passphraseRequiredChanged':
      return { ...state, passphraseIsRequired: action.required };
    case 'resetAfterSuccess':
      return {
        ...initialDecryptState,
        encryptedContent: '',
      };
    default:
      return state;
  }
}
