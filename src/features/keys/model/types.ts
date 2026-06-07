import type { KeyMetadata } from '../../../types/types';
import type { PgpArmorType } from '../domain/pgpValidation';

export type KeyAction = 'view' | 'create' | 'import';

export interface KeysUiState {
  importKey: string;
  importKeyType: PgpArmorType;
  metadata: KeyMetadata | undefined;
  setImportAsDefault: boolean;
  isValidPrivateKey: boolean;
  importPassphrase: string;
  importPassphraseError: string;
  keyAction: KeyAction;
  isLoading: boolean;
  isDeleting: boolean;
  formResetKey: number;
  expandedKeyFingerprint: string | null;
}
