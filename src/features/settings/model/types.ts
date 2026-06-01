export interface SettingsUiState {
  showDeleteDialog: boolean;
  showDisableMfaDialog: boolean;
  showRevokeSessionsDialog: boolean;
  showRegenerateCodesDialog: boolean;
  revokeSessionsLoading: boolean;
  biometricToggleLoading: boolean;
  passphraseStorageLoading: boolean;
  logoutLoading: boolean;
}
