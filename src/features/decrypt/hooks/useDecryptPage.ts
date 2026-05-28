import Clipboard from '@react-native-clipboard/clipboard';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { SetStateAction } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import type { DecryptScreenRouteProp, RootNavigationProps } from '../../../app/navigation/types';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { SUCCESS_MESSAGES } from '../../../utils/errorHandling';
import { validateDecryptionForm } from '../../../utils/validation';
import { getDefaultSelectedPrivateKey } from '../../keys/domain/keyUtils';
import { validateArmor } from '../../keys/domain/pgpValidation';
import { securityService } from '../../security/services/securityService';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import {
  getFirstSelectedKeyId,
  hasSelectedKeys,
  isPassphraseRequired,
} from '../domain/decryptDomain';
import type { KeySelectionMap } from '../model/types';
import { decryptReducer, initialDecryptState } from '../state/decryptReducer';

export function useDecryptPage() {
  const route = useRoute<DecryptScreenRouteProp>();
  const navigation = useNavigation<RootNavigationProps>();
  const { user, isAuthLoading, userDecrypted, visibleKeys } = useAuth();
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(decryptReducer, initialDecryptState);
  const shouldResetOnFocus = useRef(false);
  const [isRedirectingToKeys, setIsRedirectingToKeys] = useState(false);

  const pickFile = useFilePicker(['.txt', '.asc', '.pgp', '.gpg'], 'message');
  const keySelectionKeys = visibleKeys;
  const privateKeys = keySelectionKeys.filter(key => key.privateKey);
  const shouldRedirectToKeys = Boolean(userDecrypted && !isAuthLoading && privateKeys.length === 0);

  useEffect(() => {
    if (!hasSelectedKeys(state.selectedPublicKeys)) {
      dispatch({ type: 'useDetachedVerificationChanged', enabled: false });
      dispatch({ type: 'signatureChanged', signature: '' });
      dispatch({ type: 'detachedSignatureStatusChanged', status: 'unknown' });
    }
  }, [state.selectedPublicKeys]);

  useEffect(() => {
    if (keySelectionKeys.length > 0 && !hasSelectedKeys(state.selectedPrivateKey)) {
      const defaultKey = getDefaultSelectedPrivateKey(keySelectionKeys);
      if (defaultKey) {
        dispatch({ type: 'selectedPrivateKeyChanged', selectedPrivateKey: defaultKey });
      }
    }

  }, [keySelectionKeys, state.selectedPrivateKey]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldRedirectToKeys) {
        setIsRedirectingToKeys(false);
        return;
      }

      setIsRedirectingToKeys(true);
      showToast('No private keys found, please create/import a key pair first', 'info');
      const interaction = InteractionManager.runAfterInteractions(() => {
        navigation.navigate('Home', { screen: 'Key', params: { action: 'create' } });
      });

      return () => {
        interaction.cancel?.();
        setIsRedirectingToKeys(false);
      };
    }, [navigation, shouldRedirectToKeys, showToast]),
  );

  useEffect(() => {
    if (route.params?.text) {
      dispatch({ type: 'encryptedContentChanged', content: route.params.text });
    }
  }, [route.params?.text]);

  useEffect(() => {
    const required = isPassphraseRequired(keySelectionKeys, state.selectedPrivateKey);
    dispatch({ type: 'passphraseRequiredChanged', required });
  }, [keySelectionKeys, state.selectedPrivateKey]);

  useFocusEffect(
    useCallback(() => {
      if (shouldResetOnFocus.current) {
        dispatch({ type: 'resetAfterSuccess' });
        shouldResetOnFocus.current = false;
      }

      return () => {
        if (state.wasSuccessful) {
          shouldResetOnFocus.current = true;
        }
      };
    }, [state.wasSuccessful]),
  );

  const setSelectedPrivateKey: (value: SetStateAction<KeySelectionMap>) => void = value => {
    const next = typeof value === 'function' ? value(state.selectedPrivateKey) : value;
    dispatch({ type: 'selectedPrivateKeyChanged', selectedPrivateKey: next });
  };

  const setSelectedPublicKeys: (value: SetStateAction<KeySelectionMap>) => void = value => {
    const next = typeof value === 'function' ? value(state.selectedPublicKeys) : value;
    dispatch({ type: 'selectedPublicKeysChanged', selectedPublicKeys: next });
  };

  const handleDecrypt = async () => {
    const privateKeyId = getFirstSelectedKeyId(state.selectedPrivateKey);
    const publicKeyId = getFirstSelectedKeyId(state.selectedPublicKeys);
    const publicKeyArmored = publicKeyId ? state.selectedPublicKeys[publicKeyId] : undefined;

    const formErrors = validateDecryptionForm(state.encryptedContent, state.selectedPrivateKey);
    dispatch({ type: 'formErrorsChanged', formErrors });
    if (Object.keys(formErrors).length > 0) return;

    try {
      dispatch({ type: 'decryptStarted' });

      if (privateKeyId && state.selectedPrivateKey[privateKeyId]) {
        const validPassphrase = await pgpCryptoService.validatePrivateKeyPassphrase(
          state.selectedPrivateKey[privateKeyId],
          state.passphrase,
        );

        if (!validPassphrase) {
          showToast('Incorrect passphrase for the selected private key', 'error');
          return;
        }
      }

      const result = await pgpCryptoService.decryptMessage(
        state.encryptedContent,
        state.selectedPrivateKey[privateKeyId || ''],
        state.passphrase,
        hasSelectedKeys(state.selectedPublicKeys) ? publicKeyArmored : undefined,
      );

      dispatch({ type: 'decryptedContentSet', content: result.decrypted });

      if (hasSelectedKeys(state.selectedPublicKeys)) {
        if (state.useDetachedVerification) {
          if (state.signature.trim().length > 0 && publicKeyArmored) {
            const isValid = await pgpCryptoService.verifyDetachedSignature(
              state.signature,
              result.decrypted,
              publicKeyArmored,
            );

            dispatch({
              type: 'detachedSignatureStatusChanged',
              status: isValid ? 'valid' : 'invalid',
            });
          } else {
            dispatch({ type: 'detachedSignatureStatusChanged', status: 'unknown' });
          }
        }

        const embeddedStatus = result.verified === true
          ? 'valid'
          : result.verified === false
            ? 'invalid'
            : 'unknown';

        dispatch({ type: 'embeddedSignatureStatusChanged', status: embeddedStatus });
      } else {
        dispatch({ type: 'embeddedSignatureStatusChanged', status: 'unknown' });
        dispatch({ type: 'detachedSignatureStatusChanged', status: 'unknown' });
      }

      dispatch({ type: 'markSuccessful' });
      showToast('Decryption successful!', 'success');

      if (privateKeyId) {
        try {
          await securityService.storePassphrase(
            user?.uid || '',
            { [privateKeyId]: state.passphrase },
            privateKeyId,
          );
        } catch {
          // Ignore passphrase persistence failures for decrypt flow.
        }
      }
    } catch {
      showToast('Failed to decrypt the message', 'error');
    } finally {
      dispatch({ type: 'decryptFinished' });
    }
  };

  const handleCopy = () => {
    Clipboard.setString(state.decryptedContent);
    showToast(SUCCESS_MESSAGES.DECRYPTED_COPIED, 'success');
  };

  const handlePickEncryptedFile = () => {
    void pickFile(
      content => dispatch({ type: 'encryptedContentChanged', content }),
      message => showToast(message, 'error'),
    );
  };

  const handlePickSignatureFile = () => {
    void pickFile(
      signature => dispatch({ type: 'signatureChanged', signature }),
      message => showToast(message, 'error'),
    );
  };

  return {
    state,
    userDecrypted,
    shouldRedirectToKeys: shouldRedirectToKeys || isRedirectingToKeys,
    isLoadingOverlay: !userDecrypted || isAuthLoading || isRedirectingToKeys,
    privateKeys,
    publicKeys: keySelectionKeys,
    isDecryptDisabled: !hasSelectedKeys(state.selectedPrivateKey) || state.isDecrypting,
    canDecrypt:
      !(!hasSelectedKeys(state.selectedPrivateKey) || state.isDecrypting)
      && (!state.passphraseIsRequired || Boolean(state.passphrase))
      && validateArmor(state.encryptedContent, 'MESSAGE'),
    hasSelectedPublicKeys: hasSelectedKeys(state.selectedPublicKeys),
    onEncryptedContentChanged: (content: string) => {
      dispatch({ type: 'encryptedContentChanged', content });
    },
    onPassphraseChanged: (passphrase: string) => {
      dispatch({ type: 'passphraseChanged', passphrase });
    },
    onSignatureChanged: (signature: string) => {
      dispatch({ type: 'signatureChanged', signature });
    },
    onUseDetachedVerificationChanged: (enabled: boolean) => {
      dispatch({ type: 'useDetachedVerificationChanged', enabled });
    },
    onSelectedPrivateKeyChanged: setSelectedPrivateKey,
    onSelectedPublicKeysChanged: setSelectedPublicKeys,
    onDecrypt: handleDecrypt,
    onCopy: handleCopy,
    onPickEncryptedFile: handlePickEncryptedFile,
    onPickSignatureFile: handlePickSignatureFile,
  };
}
