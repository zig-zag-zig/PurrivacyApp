import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import {
  hasExistingDefaultKeyPair,
  isImportKeyValid,
  mergeOptimisticKeys,
  sortKeysForView,
} from '../domain/keyScreenDomain';
import type { KeyAction } from '../model/types';
import { initialKeyScreenState, keyScreenReducer } from '../state/keyScreenReducer';
import { useImportKeyDefaults } from './useImportKeyDefaults';
import { useKeyListExpansion } from './useKeyListExpansion';
import { useKeyOperations } from './useKeyOperations';
import { useKeyRouteParams } from './useKeyRouteParams';

export function useKeyScreen() {
  const { user, userDecrypted, visibleKeys, isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(keyScreenReducer, initialKeyScreenState);

  const setLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: 'loadingChanged', isLoading });
  }, []);

  // Clear optimistic keys when real keys update (reconciliation).
  // Optimistic keys are shown immediately on create/import; once the backend
  // refresh lands, the real keys replace them.
  const prevVisibleKeysRef = useRef(visibleKeys);
  useEffect(() => {
    if (prevVisibleKeysRef.current !== visibleKeys) {
      dispatch({ type: 'optimisticKeysCleared' });
    }
    prevVisibleKeysRef.current = visibleKeys;
  }, [visibleKeys]);

  useKeyRouteParams(dispatch);
  useImportKeyDefaults({
    importKey: state.importKey,
    keyAction: state.keyAction,
    isValidPrivateKey: state.isValidPrivateKey,
    keys: userDecrypted?.keys,
    dispatch,
  });

  const displayKeys = useMemo(
    () => sortKeysForView(mergeOptimisticKeys(visibleKeys, state.optimisticKeys, state.optimisticRemovedFingerprints)),
    [visibleKeys, state.optimisticKeys, state.optimisticRemovedFingerprints],
  );

  const keyListExpansion = useKeyListExpansion(state.expandedKeyFingerprint, dispatch);
  const keyOperations = useKeyOperations({
    user,
    userDecrypted,
    state,
    dispatch,
    setLoading,
    showToast,
  });

  const hasDefaultKeyPair = hasExistingDefaultKeyPair(userDecrypted?.keys);
  const shouldForceDefaultInCreate = !hasDefaultKeyPair;
  const canImportKey = isImportKeyValid(state.importKey)
    && (state.importKeyType === 'public' || state.importKeyType === 'private');
  const isProtectedPrivateImport =
    state.importKeyType === 'private'
    && state.metadata?.privateKeyIsUnlocked === false;
  const isResolvingKeys = !userDecrypted || isAuthLoading;

  return {
    state,
    user,
    userDecrypted,
    sortedKeys: displayKeys,
    scrollRef: keyListExpansion.scrollRef,
    itemRefs: keyListExpansion.itemRefs,
    isResolvingKeys,
    isLoadingOverlay: state.isDeleting,
    canImportKey,
    shouldForceDefaultInCreate,
    createSetAsDefaultValue: shouldForceDefaultInCreate ? true : state.setImportAsDefault,
    createSetAsDefaultDisabled: shouldForceDefaultInCreate,
    showImportSetDefaultToggle: state.importKeyType === 'private' && (userDecrypted?.keys.length ?? 0) > 0,
    hasDefaultKeyPair,
    isImportButtonDisabled:
      state.importKey.trim() === ''
      || !canImportKey
      || !state.metadata
      || Boolean(isProtectedPrivateImport && !state.importPassphrase),
    onScroll: keyListExpansion.onScroll,
    onToggleExpandedKey: keyListExpansion.onToggleExpandedKey,
    onCreateKey: keyOperations.onCreateKey,
    onImportKey: keyOperations.onImportKey,
    onDeleteKey: keyOperations.onDeleteKey,
    onSetDefaultKey: keyOperations.onSetDefaultKey,
    onChangePassphrase: keyOperations.onChangePassphrase,
    onChangeExpiration: keyOperations.onChangeExpiration,
    onPickImportFile: keyOperations.onPickImportFile,
    onKeyActionChanged: (keyAction: KeyAction) => dispatch({ type: 'keyActionChanged', keyAction }),
    onImportKeyChanged: (importKey: string) => dispatch({ type: 'importKeyChanged', importKey }),
    onImportPassphraseChanged: (importPassphrase: string) => {
      dispatch({ type: 'importPassphraseChanged', importPassphrase });
    },
    onImportSetAsDefaultChanged: (setImportAsDefault: boolean) => {
      dispatch({ type: 'setImportAsDefaultChanged', setImportAsDefault });
    },
  };
}
