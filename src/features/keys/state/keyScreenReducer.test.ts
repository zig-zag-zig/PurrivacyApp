import { describe, expect, it } from 'vitest';

import { initialKeyScreenState, keyScreenReducer } from './keyScreenReducer';
import type { KeysUiState } from '../model/types';

describe('keyScreenReducer import state', () => {
  it('clears metadata and passphrase state when imported key content changes', () => {
    const state: KeysUiState = {
      ...initialKeyScreenState,
      importKey: 'old private key',
      importKeyType: 'private',
      importPassphrase: 'old passphrase',
      importPassphraseError: 'Incorrect passphrase',
      metadata: {
        algorithm: 'RSA',
        expiry: 'Never',
        fingerprint: 'old-fingerprint',
        privateKeyIsUnlocked: false,
        userId: 'Old key',
      },
    };

    expect(keyScreenReducer(state, {
      type: 'importKeyChanged',
      importKey: 'new private key',
    })).toEqual({
      ...state,
      importKey: 'new private key',
      importKeyType: 'unknown',
      isValidPrivateKey: false,
      importPassphrase: '',
      importPassphraseError: '',
      metadata: undefined,
    });
  });

  it('tracks the verified armor type separately from raw import text', () => {
    expect(keyScreenReducer(initialKeyScreenState, {
      type: 'importKeyTypeChanged',
      importKeyType: 'public',
    })).toEqual({
      ...initialKeyScreenState,
      importKeyType: 'public',
    });
  });
});
