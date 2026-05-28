import { useEffect } from 'react';
import type { Dispatch } from 'react';

import type { KeyPair } from '../../../types/types';
import { hasExistingDefaultKeyPair } from '../domain/keyScreenDomain';
import { identifyKeyType } from '../domain/pgpValidation';
import type { KeyAction } from '../model/types';
import type { KeyScreenAction } from '../state/keyScreenReducer';

type ImportKeyDefaultsParams = {
  importKey: string;
  keyAction: KeyAction;
  isValidPrivateKey: boolean;
  keys: KeyPair[] | undefined;
  dispatch: Dispatch<KeyScreenAction>;
};

export function useImportKeyDefaults({
  importKey,
  keyAction,
  isValidPrivateKey,
  keys,
  dispatch,
}: ImportKeyDefaultsParams): void {
  useEffect(() => {
    const trimmedImportKey = importKey.trim();
    if (!trimmedImportKey) {
      dispatch({ type: 'isValidPrivateKeyChanged', isValidPrivateKey: false });
      dispatch({ type: 'setImportAsDefaultChanged', setImportAsDefault: false });
      return;
    }

    const keyType = identifyKeyType(trimmedImportKey);
    const nextIsValidPrivateKey = keyType === 'private';
    const hasDefaultKeyPair = hasExistingDefaultKeyPair(keys);

    dispatch({ type: 'isValidPrivateKeyChanged', isValidPrivateKey: nextIsValidPrivateKey });
    dispatch({
      type: 'setImportAsDefaultChanged',
      setImportAsDefault: !hasDefaultKeyPair && nextIsValidPrivateKey,
    });
  }, [dispatch, importKey, keys]);

  useEffect(() => {
    const hasDefaultKeyPair = hasExistingDefaultKeyPair(keys);
    const shouldForceDefault =
      !hasDefaultKeyPair
      && (keyAction === 'create' || (keyAction === 'import' && isValidPrivateKey));

    if (shouldForceDefault) {
      dispatch({ type: 'setImportAsDefaultChanged', setImportAsDefault: true });
    }
  }, [dispatch, isValidPrivateKey, keyAction, keys]);
}
