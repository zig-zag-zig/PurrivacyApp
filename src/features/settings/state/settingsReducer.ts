import type { SettingsUiState } from '../model/types';

type SettingsAction =
  | { type: 'deleteDialogChanged'; visible: boolean }
  | { type: 'disableMfaDialogChanged'; visible: boolean }
  | { type: 'revokeSessionsDialogChanged'; visible: boolean }
  | { type: 'regenerateCodesDialogChanged'; visible: boolean }
  | { type: 'revokeSessionsLoadingChanged'; loading: boolean }
  | { type: 'biometricToggleLoadingChanged'; loading: boolean }
  | { type: 'passphraseStorageLoadingChanged'; loading: boolean }
  | { type: 'logoutLoadingChanged'; loading: boolean };

export const initialSettingsState: SettingsUiState = {
  showDeleteDialog: false,
  showDisableMfaDialog: false,
  showRevokeSessionsDialog: false,
  showRegenerateCodesDialog: false,
  revokeSessionsLoading: false,
  biometricToggleLoading: false,
  passphraseStorageLoading: false,
  logoutLoading: false,
};

export function settingsReducer(state: SettingsUiState, action: SettingsAction): SettingsUiState {
  switch (action.type) {
    case 'deleteDialogChanged':
      return { ...state, showDeleteDialog: action.visible };
    case 'disableMfaDialogChanged':
      return { ...state, showDisableMfaDialog: action.visible };
    case 'revokeSessionsDialogChanged':
      return { ...state, showRevokeSessionsDialog: action.visible };
    case 'regenerateCodesDialogChanged':
      return { ...state, showRegenerateCodesDialog: action.visible };
    case 'revokeSessionsLoadingChanged':
      return { ...state, revokeSessionsLoading: action.loading };
    case 'biometricToggleLoadingChanged':
      return { ...state, biometricToggleLoading: action.loading };
    case 'passphraseStorageLoadingChanged':
      return { ...state, passphraseStorageLoading: action.loading };
    case 'logoutLoadingChanged':
      return { ...state, logoutLoading: action.loading };
    default:
      return state;
  }
}
