import { useCallback, useMemo, useReducer } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import {
  hasExistingDefaultKeyPair,
  isImportKeyValid,
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

  useKeyRouteParams(dispatch);
  useImportKeyDefaults({
    importKey: state.importKey,
    keyAction: state.keyAction,
    isValidPrivateKey: state.isValidPrivateKey,
    keys: userDecrypted?.keys,
    dispatch,
  });

  const sortedKeys = useMemo(
    () => sortKeysForView(visibleKeys),
    [visibleKeys],
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
  const canImportKey = isImportKeyValid(state.importKey);
  const isResolvingKeys = !userDecrypted || isAuthLoading;

  return {
    state,
    user,
    userDecrypted,
    sortedKeys,
    scrollRef: keyListExpansion.scrollRef,
    itemRefs: keyListExpansion.itemRefs,
    isResolvingKeys,
    isLoadingOverlay: state.isDeleting,
    canImportKey,
    shouldForceDefaultInCreate,
    createSetAsDefaultValue: shouldForceDefaultInCreate ? true : state.setImportAsDefault,
    createSetAsDefaultDisabled: shouldForceDefaultInCreate,
    showImportSetDefaultToggle: state.isValidPrivateKey && (userDecrypted?.keys.length ?? 0) > 0,
    hasDefaultKeyPair,
    isImportButtonDisabled:
      state.importKey.trim() === ''
      || !canImportKey
      || Boolean(state.metadata && state.metadata.privateKeyIsUnlocked === false && !state.importPassphrase),
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
