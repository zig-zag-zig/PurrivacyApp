import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { SetStateAction } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import type { EncryptScreenRouteProp, RootNavigationProps } from '../../../app/navigation/types';
import { useFilePicker } from '../../../hooks/useFilePicker';
import type { KeyPair } from '../../../types/types';
import { SUCCESS_MESSAGES } from '../../../utils/errorHandling';
import { validateEncryptionForm } from '../../../utils/validation';
import { getCompleteKeyPairs } from '../../keys/domain/keyUtils';
import { securityService } from '../../security/services/securityService';
import { usePassphraseStorageConsent } from '../../security/hooks/usePassphraseStorageConsent';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import { PgPKeyService } from '../../keys/services/pgpKeyService';
import {
  getFirstSelectedKeyId,
  isPassphraseRequired,
  normalizeSelectedPublicKeys,
} from '../domain/encryptDomain';
import type { KeySelectionMap } from '../model/types';
import { encryptReducer, initialEncryptState } from '../state/encryptReducer';

export function useEncryptPage() {
  const route = useRoute<EncryptScreenRouteProp>();
  const navigation = useNavigation<RootNavigationProps>();
  const { userDecrypted, visibleKeys, user, isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const ensurePassphraseStorageConsent = usePassphraseStorageConsent(user?.uid);
  const [state, dispatch] = useReducer(encryptReducer, initialEncryptState);
  const shouldResetOnFocus = useRef(false);
  const [isRedirectingToKeys, setIsRedirectingToKeys] = useState(false);

  const pickFile = useFilePicker(['.txt']);
  const keySelectionKeys = visibleKeys;
  const shouldRedirectToKeys = Boolean(userDecrypted && !isAuthLoading && keySelectionKeys.length === 0);

  useEffect(() => {
    const completeKeyPairs = getCompleteKeyPairs(keySelectionKeys);
    dispatch({ type: 'completeKeyPairsChanged', completeKeyPairs });
  }, [keySelectionKeys]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldRedirectToKeys) {
        setIsRedirectingToKeys(false);
        return;
      }

      setIsRedirectingToKeys(true);
      showToast('No public keys available, please import a key first', 'info');
      const interaction = InteractionManager.runAfterInteractions(() => {
        navigation.navigate('Home', { screen: 'Key', params: { action: 'import' } });
      });

      return () => {
        interaction.cancel?.();
        setIsRedirectingToKeys(false);
      };
    }, [navigation, shouldRedirectToKeys, showToast]),
  );

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

  useEffect(() => {
    if (route.params?.text) {
      dispatch({ type: 'contentChanged', content: route.params.text });
    }
  }, [route.params?.text]);

  useEffect(() => {
    const privateKeyId = getFirstSelectedKeyId(state.selectedPrivateKey);
    const selectedKey = privateKeyId
      ? state.completeKeyPairs.find(key => key.fingerprint === privateKeyId)
      : undefined;

    dispatch({
      type: 'passphraseRequiredChanged',
      passphraseIsRequired: isPassphraseRequired(selectedKey, state.signMessage, state.selectedPrivateKey),
    });
  }, [state.completeKeyPairs, state.selectedPrivateKey, state.signMessage]);

  const setSelectedPrivateKey: (value: SetStateAction<KeySelectionMap>) => void = value => {
    const next = typeof value === 'function' ? value(state.selectedPrivateKey) : value;
    dispatch({ type: 'selectedPrivateKeyChanged', selectedPrivateKey: next });
  };

  const setSelectedPublicKeys: (value: SetStateAction<KeySelectionMap>) => void = value => {
    const next = typeof value === 'function' ? value(state.selectedPublicKeys) : value;
    dispatch({
      type: 'selectedPublicKeysChanged',
      selectedPublicKeys: normalizeSelectedPublicKeys(state.selectedPublicKeys, next),
    });
  };

  const setSignMessage: (value: SetStateAction<boolean>) => void = value => {
    const signMessage = typeof value === 'function' ? value(state.signMessage) : value;
    dispatch({ type: 'signMessageChanged', signMessage });
  };

  const handleEncrypt = async () => {
    const selectedPrivateKeyIds = Object.keys(state.selectedPrivateKey);
    const privateKeyId = selectedPrivateKeyIds[0];

    const formErrors = validateEncryptionForm(
      state.content,
      state.selectedPublicKeys,
      state.signMessage ? state.selectedPrivateKey : {},
      state.signMessage,
    );

    dispatch({ type: 'formErrorsChanged', formErrors });
    if (Object.keys(formErrors).length > 0) return;

    const needsPassphrase = state.signMessage && selectedPrivateKeyIds.length > 0;

    try {
      dispatch({ type: 'encryptStarted' });

      const selectedKeyPair: KeyPair | undefined = privateKeyId
        ? state.completeKeyPairs.find(key => key.fingerprint === privateKeyId)
        : undefined;

      let contentToEncrypt = state.content;
      if (state.includePublicKey && selectedKeyPair?.publicKey) {
        contentToEncrypt += `\n\n${selectedKeyPair.publicKey}`;
      }

      if (needsPassphrase && privateKeyId && state.selectedPrivateKey[privateKeyId]) {
        const validPassphrase = await pgpCryptoService.validatePrivateKeyPassphrase(
          state.selectedPrivateKey[privateKeyId],
          state.passphrase,
        );

        if (!validPassphrase) {
          showToast('Incorrect passphrase for the selected private key', 'error');
          return;
        }
      }

      const encryptedContent = await pgpCryptoService.encryptMessage(
        Object.values(state.selectedPublicKeys),
        contentToEncrypt,
        needsPassphrase && privateKeyId
          ? {
              privateKey: state.selectedPrivateKey[privateKeyId],
              passphrase: state.passphrase,
            }
          : undefined,
      );

      dispatch({ type: 'encryptedContentChanged', encryptedContent });

      if (state.signMessage && privateKeyId && state.selectedPrivateKey[privateKeyId]) {
        try {
          const signature = await pgpCryptoService.createDetachedSignature(
            contentToEncrypt,
            state.selectedPrivateKey[privateKeyId],
            state.passphrase,
          );
          dispatch({ type: 'signatureChanged', signature });
        } catch {
          dispatch({ type: 'signatureChanged', signature: '' });
        }
      } else {
        dispatch({ type: 'signatureChanged', signature: '' });
      }

      dispatch({ type: 'markSuccessful' });
      showToast('Encryption successful!', 'success');

      if (needsPassphrase && privateKeyId) {
        try {
          if (await ensurePassphraseStorageConsent()) {
            await PgPKeyService.storeSyncedPassphrase(
              user?.uid || '',
              privateKeyId,
              state.passphrase,
            );
            await securityService.storePassphrase(
              user?.uid || '',
              { [privateKeyId]: state.passphrase },
              privateKeyId,
            );
          }
        } catch {
          // Ignore passphrase persistence failures for encrypt flow.
        }
      }
    } catch {
      showToast('Failed to encrypt the message', 'error');
    } finally {
      dispatch({ type: 'encryptFinished' });
    }
  };

  const handleCopyEncrypted = () => {
    if (!state.encryptedContent) return;
    void Clipboard.setStringAsync(state.encryptedContent);
    showToast(SUCCESS_MESSAGES.ENCRYPTED_COPIED, 'info');
  };

  const handleCopySignature = () => {
    if (!state.signature) return;
    void Clipboard.setStringAsync(state.signature);
    showToast(SUCCESS_MESSAGES.SIGNATURE_COPIED, 'info');
  };

  const handlePickContentFile = () => {
    void pickFile(
      content => dispatch({ type: 'contentChanged', content }),
      message => showToast(message, 'error'),
    );
  };

  const selectedPrivateKeyCount = Object.keys(state.selectedPrivateKey).length;
  const selectedPublicKeyCount = Object.keys(state.selectedPublicKeys).length;

  return {
    state,
    userDecrypted,
    keySelectionKeys,
    shouldRedirectToKeys: shouldRedirectToKeys || isRedirectingToKeys,
    isLoadingOverlay: !userDecrypted || isAuthLoading || isRedirectingToKeys,
    canEncrypt:
      state.content.trim() !== ''
      && selectedPublicKeyCount > 0
      && (!state.signMessage || selectedPrivateKeyCount > 0)
      && (!state.passphraseIsRequired || Boolean(state.passphrase))
      && !state.isEncrypting,
    showIncludePublicKeyToggle: selectedPrivateKeyCount > 0,
    onContentChanged: (content: string) => dispatch({ type: 'contentChanged', content }),
    onPassphraseChanged: (passphrase: string) => dispatch({ type: 'passphraseChanged', passphrase }),
    onIncludePublicKeyChanged: (includePublicKey: boolean) => {
      dispatch({ type: 'includePublicKeyChanged', includePublicKey });
    },
    onSignMessageChanged: setSignMessage,
    onSelectedPrivateKeyChanged: setSelectedPrivateKey,
    onSelectedPublicKeysChanged: setSelectedPublicKeys,
    onEncrypt: handleEncrypt,
    onCopyEncrypted: handleCopyEncrypted,
    onCopySignature: handleCopySignature,
    onPickContentFile: handlePickContentFile,
  };
}
