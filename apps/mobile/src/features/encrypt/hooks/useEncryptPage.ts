import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useReducer } from 'react';
import type { SetStateAction } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
import { useEncryptedComposeDraft } from '../../../services/drafts';
import { useMemo } from 'react';
import { useToast } from '../../../app/state/ToastContext';
import { useOperationCenter } from '../../../app/state/OperationCenterContext';

/** "Alice, Bob" or "Alice, Bob +2 more" — compact recipient/sender list for
 * the operation card, with overflow collapsed instead of wrapping forever. */
const formatKeyUserIds = (userIds: (string | undefined)[]): string => {
    const clean = userIds.map(u => (u ?? '').trim()).filter(Boolean);
    if (clean.length === 0) return '';
    if (clean.length <= 2) return clean.join(', ');
    return `${clean.slice(0, 2).join(', ')} +${clean.length - 2} more`;
};
import type { EncryptScreenRouteProp, RootNavigationProps } from '../../../app/navigation/types';
import { useFilePicker } from '../../../shared/hooks/useFilePicker';
import { useKeyPrerequisiteRedirect } from '../../../shared/hooks/useKeyPrerequisiteRedirect';
import { useResetStateOnBlurSuccess } from '../../../shared/hooks/useResetStateOnBlurSuccess';
import type { KeyPair } from '../../../types/types';
import { SUCCESS_MESSAGES } from '../../../utils/errorHandling';
import { validateEncryptionForm } from '../../../utils/validation';
import { getCompleteKeyPairs } from '../../keys/domain/keyUtils';
import { pgpCryptoService } from '../../../services/pgpCryptoService';
import {
  getFirstSelectedKeyId,
  isPassphraseRequired,
  normalizeSelectedPublicKeys,
} from '../domain/encryptDomain';
import type { KeySelectionMap } from '../model/types';
import { encryptReducer, initialEncryptState } from '../state/encryptReducer';
import { useSecureCopy } from '../../../shared/hooks/useSecureCopy';

export function useEncryptPage() {
  const route = useRoute<EncryptScreenRouteProp>();
  const navigation = useNavigation<RootNavigationProps>();
  const { userDecrypted, visibleKeys, user, isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const { beginOperation } = useOperationCenter();
  const [state, dispatch] = useReducer(encryptReducer, initialEncryptState);
  const { secureCopy } = useSecureCopy();

  const pickFile = useFilePicker(['.txt']);
  // Exclude revoked keys from the recipient picker: they cannot be encrypted
  // to (the WebView also refuses), and offering them is a footgun.
  const keySelectionKeys = useMemo(
    () => visibleKeys.filter(key => !key.revoked),
    [visibleKeys],
  );
  const shouldRedirectToKeys = Boolean(userDecrypted && !isAuthLoading && keySelectionKeys.length === 0);

  const { isRedirecting: isRedirectingToKeys } = useKeyPrerequisiteRedirect(
    shouldRedirectToKeys,
    'Import or create a public key before encrypting.',
    { screen: 'Key', params: { action: 'import' } },
    navigation,
  );

  useResetStateOnBlurSuccess(
    state.wasSuccessful,
    () => dispatch({ type: 'resetAfterSuccess' }),
  );

  // Persist the compose field as an encrypted draft so a failed encrypt or an
  // app background doesn't lose a long message. Cleared on success.
  useEncryptedComposeDraft({
    userId: user?.uid,
    slot: 'encrypt',
    value: state.content,
    shouldClear: state.wasSuccessful,
    onRestore: draft => dispatch({ type: 'contentChanged', content: draft }),
  });

  useEffect(() => {
    const completeKeyPairs = getCompleteKeyPairs(keySelectionKeys);
    dispatch({ type: 'completeKeyPairsChanged', completeKeyPairs });
  }, [keySelectionKeys]);

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

      const recipientUserIds = Object.keys(state.selectedPublicKeys)
        .map(fp => keySelectionKeys.find(key => key.fingerprint === fp)?.userId);
      const senderUserId = state.signMessage && privateKeyId
        ? state.completeKeyPairs.find(key => key.fingerprint === privateKeyId)?.userId
        : undefined;
      const operationDetail = [
        recipientUserIds.length ? `To ${formatKeyUserIds(recipientUserIds)}` : null,
        senderUserId ? `Signed by ${senderUserId.trim()}` : null,
      ].filter(Boolean).join(' · ');

      const { encryptedContent, signature } = await beginOperation({
        kind: 'text-encrypt',
        title: 'Encrypting message',
        detail: operationDetail || undefined,
        run: async api => {
          const encrypted = await pgpCryptoService.encryptMessage(
            Object.values(state.selectedPublicKeys),
            contentToEncrypt,
            needsPassphrase && privateKeyId
              ? {
                privateKey: state.selectedPrivateKey[privateKeyId],
                passphrase: state.passphrase,
              }
              : undefined,
          );
          // Sign inside the operation so the detached signature lands in the
          // same result the modal displays.
          let detachedSignature = '';
          if (state.signMessage && privateKeyId && state.selectedPrivateKey[privateKeyId]) {
            try {
              detachedSignature = await pgpCryptoService.createDetachedSignature(
                contentToEncrypt,
                state.selectedPrivateKey[privateKeyId],
                state.passphrase,
              );
            } catch {
              detachedSignature = '';
            }
          }
          api.succeed(
            { encryptedContent: encrypted, signature: detachedSignature },
            `${contentToEncrypt.length} characters encrypted`,
          );
          return { encryptedContent: encrypted, signature: detachedSignature };
        },
      });

      dispatch({ type: 'encryptedContentChanged', encryptedContent });
      dispatch({ type: 'signatureChanged', signature });
      // The outcome lives in the operation modal now, so the composer is reset
      // rather than left holding the plaintext and passphrase.
      dispatch({ type: 'resetAfterSuccess' });
      showToast('Encryption successful!', 'success');

    } catch (error: any) {
      const message = typeof error?.message === 'string' && error.message.toLowerCase().includes('revoked')
        ? error.message
        : 'Failed to encrypt the message';
      showToast(message, 'error');
    } finally {
      dispatch({ type: 'encryptFinished' });
    }
  };

  const handleCopyEncrypted = () => {
    if (!state.encryptedContent) return;
    void secureCopy(state.encryptedContent, { sensitivity: 'low' });
    showToast(SUCCESS_MESSAGES.ENCRYPTED_COPIED, 'info');
  };

  const handleCopySignature = () => {
    if (!state.signature) return;
    void secureCopy(state.signature, { sensitivity: 'low' });
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
    isLoadingOverlay: !userDecrypted || isAuthLoading,
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
