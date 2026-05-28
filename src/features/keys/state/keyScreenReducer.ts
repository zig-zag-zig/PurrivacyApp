import type { KeyMetadata } from '../../../types/types';
import type { KeyAction, KeysUiState } from '../model/types';

export type KeyScreenAction =
  | { type: 'importKeyChanged'; importKey: string }
  | { type: 'metadataChanged'; metadata: KeyMetadata | undefined }
  | { type: 'setImportAsDefaultChanged'; setImportAsDefault: boolean }
  | { type: 'isValidPrivateKeyChanged'; isValidPrivateKey: boolean }
  | { type: 'importPassphraseChanged'; importPassphrase: string }
  | { type: 'importPassphraseErrorChanged'; importPassphraseError: string }
  | { type: 'keyActionChanged'; keyAction: KeyAction }
  | { type: 'loadingChanged'; isLoading: boolean }
  | { type: 'deletingChanged'; isDeleting: boolean }
  | { type: 'formResetIncremented' }
  | { type: 'expandedKeyFingerprintChanged'; expandedKeyFingerprint: string | null }
  | { type: 'importFormReset' };

export const initialKeyScreenState: KeysUiState = {
  importKey: '',
  metadata: undefined,
  setImportAsDefault: false,
  isValidPrivateKey: false,
  importPassphrase: '',
  importPassphraseError: '',
  keyAction: 'view',
  isLoading: false,
  isDeleting: false,
  formResetKey: 0,
  expandedKeyFingerprint: null,
};

export function keyScreenReducer(state: KeysUiState, action: KeyScreenAction): KeysUiState {
  switch (action.type) {
    case 'importKeyChanged':
      return { ...state, importKey: action.importKey };
    case 'metadataChanged':
      return { ...state, metadata: action.metadata };
    case 'setImportAsDefaultChanged':
      return { ...state, setImportAsDefault: action.setImportAsDefault };
    case 'isValidPrivateKeyChanged':
      return { ...state, isValidPrivateKey: action.isValidPrivateKey };
    case 'importPassphraseChanged':
      return { ...state, importPassphrase: action.importPassphrase };
    case 'importPassphraseErrorChanged':
      return { ...state, importPassphraseError: action.importPassphraseError };
    case 'keyActionChanged':
      return { ...state, keyAction: action.keyAction };
    case 'loadingChanged':
      return { ...state, isLoading: action.isLoading };
    case 'deletingChanged':
      return { ...state, isDeleting: action.isDeleting };
    case 'formResetIncremented':
      return { ...state, formResetKey: state.formResetKey + 1 };
    case 'expandedKeyFingerprintChanged':
      return { ...state, expandedKeyFingerprint: action.expandedKeyFingerprint };
    case 'importFormReset':
      return {
        ...state,
        metadata: undefined,
        importKey: '',
        importPassphrase: '',
        importPassphraseError: '',
        isValidPrivateKey: false,
      };
    default:
      return state;
  }
}
