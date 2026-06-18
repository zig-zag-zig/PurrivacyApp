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

const makeTestKey = (fingerprint: string): any => ({
  fingerprint,
  publicKey: `pk-${fingerprint}`,
  privateKey: `sk-${fingerprint}`,
  isDefault: false,
  userId: 'Test User',
  algorithm: 'RSA',
  expiry: 'Never',
});

describe('keyScreenReducer optimistic key state', () => {
  it('adds an optimistic key and clears isLoading on optimisticKeyAdded', () => {
    const state = { ...initialKeyScreenState, isLoading: true };
    const key = makeTestKey('new-fp');

    const next = keyScreenReducer(state, { type: 'optimisticKeyAdded', key });

    expect(next.optimisticKeys).toEqual([key]);
    expect(next.isLoading).toBe(false);
  });

  it('appends multiple optimistic keys', () => {
    const key1 = makeTestKey('fp1');
    const key2 = makeTestKey('fp2');

    let state = keyScreenReducer(initialKeyScreenState, { type: 'optimisticKeyAdded', key: key1 });
    state = keyScreenReducer(state, { type: 'optimisticKeyAdded', key: key2 });

    expect(state.optimisticKeys).toHaveLength(2);
    expect(state.optimisticKeys[0].fingerprint).toBe('fp1');
    expect(state.optimisticKeys[1].fingerprint).toBe('fp2');
  });

  it('clears all optimistic keys on optimisticKeysCleared', () => {
    const key = makeTestKey('fp1');
    const state = {
      ...initialKeyScreenState,
      optimisticKeys: [key],
    };

    const next = keyScreenReducer(state, { type: 'optimisticKeysCleared' });

    expect(next.optimisticKeys).toEqual([]);
  });

  it('initial state has empty optimisticKeys', () => {
    expect(initialKeyScreenState.optimisticKeys).toEqual([]);
  });

  it('adds fingerprint to optimisticRemovedFingerprints on optimisticKeyRemoved', () => {
    const state = { ...initialKeyScreenState, isDeleting: true };

    const next = keyScreenReducer(state, { type: 'optimisticKeyRemoved', fingerprint: 'fp-to-remove' });

    expect(next.optimisticRemovedFingerprints).toEqual(['fp-to-remove']);
    expect(next.isDeleting).toBe(false);
  });

  it('appends multiple fingerprints for removal', () => {
    let state = keyScreenReducer(initialKeyScreenState, { type: 'optimisticKeyRemoved', fingerprint: 'fp1' });
    state = keyScreenReducer(state, { type: 'optimisticKeyRemoved', fingerprint: 'fp2' });

    expect(state.optimisticRemovedFingerprints).toEqual(['fp1', 'fp2']);
  });

  it('clears optimisticRemovedFingerprints on optimisticKeysCleared', () => {
    const state = {
      ...initialKeyScreenState,
      optimisticRemovedFingerprints: ['fp1', 'fp2'],
    };

    const next = keyScreenReducer(state, { type: 'optimisticKeysCleared' });

    expect(next.optimisticRemovedFingerprints).toEqual([]);
  });

  it('initial state has empty optimisticRemovedFingerprints', () => {
    expect(initialKeyScreenState.optimisticRemovedFingerprints).toEqual([]);
  });
});
