import type { KeyPair } from '../../../types/types';
import type { EncryptUiState, KeySelectionMap } from '../model/types';

type EncryptAction =
  | { type: 'contentChanged'; content: string }
  | { type: 'encryptStarted' }
  | { type: 'encryptFinished' }
  | { type: 'encryptedContentChanged'; encryptedContent: string }
  | { type: 'selectedPrivateKeyChanged'; selectedPrivateKey: KeySelectionMap }
  | { type: 'selectedPublicKeysChanged'; selectedPublicKeys: KeySelectionMap }
  | { type: 'passphraseChanged'; passphrase: string }
  | { type: 'formErrorsChanged'; formErrors: Record<string, string> }
  | { type: 'includePublicKeyChanged'; includePublicKey: boolean }
  | { type: 'signMessageChanged'; signMessage: boolean }
  | { type: 'markSuccessful' }
  | { type: 'signatureChanged'; signature: string }
  | { type: 'completeKeyPairsChanged'; completeKeyPairs: KeyPair[] }
  | { type: 'passphraseRequiredChanged'; passphraseIsRequired: boolean }
  | { type: 'resetAfterSuccess' };

export const initialEncryptState: EncryptUiState = {
  content: '',
  isEncrypting: false,
  encryptedContent: '',
  selectedPrivateKey: {},
  selectedPublicKeys: {},
  passphrase: '',
  formErrors: {},
  includePublicKey: true,
  signMessage: false,
  wasSuccessful: false,
  signature: '',
  completeKeyPairs: [],
  passphraseIsRequired: false,
};

export function encryptReducer(state: EncryptUiState, action: EncryptAction): EncryptUiState {
  switch (action.type) {
    case 'contentChanged':
      return { ...state, content: action.content };
    case 'encryptStarted':
      return { ...state, isEncrypting: true };
    case 'encryptFinished':
      return { ...state, isEncrypting: false };
    case 'encryptedContentChanged':
      return { ...state, encryptedContent: action.encryptedContent };
    case 'selectedPrivateKeyChanged':
      return { ...state, selectedPrivateKey: action.selectedPrivateKey };
    case 'selectedPublicKeysChanged':
      return { ...state, selectedPublicKeys: action.selectedPublicKeys };
    case 'passphraseChanged':
      return { ...state, passphrase: action.passphrase };
    case 'formErrorsChanged':
      return { ...state, formErrors: action.formErrors };
    case 'includePublicKeyChanged':
      return { ...state, includePublicKey: action.includePublicKey };
    case 'signMessageChanged':
      return { ...state, signMessage: action.signMessage };
    case 'markSuccessful':
      return { ...state, wasSuccessful: true };
    case 'signatureChanged':
      return { ...state, signature: action.signature };
    case 'completeKeyPairsChanged':
      return { ...state, completeKeyPairs: action.completeKeyPairs };
    case 'passphraseRequiredChanged':
      return { ...state, passphraseIsRequired: action.passphraseIsRequired };
    case 'resetAfterSuccess':
      return {
        ...initialEncryptState,
        completeKeyPairs: state.completeKeyPairs,
      };
    default:
      return state;
  }
}
