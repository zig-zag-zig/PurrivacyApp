import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useReducer } from 'react';
import type { SetStateAction } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
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
import type { DecryptScreenRouteProp, RootNavigationProps } from '../../../app/navigation/types';
import { useFilePicker } from '../../../shared/hooks/useFilePicker';
import { useKeyPrerequisiteRedirect } from '../../../shared/hooks/useKeyPrerequisiteRedirect';
import { useEncryptedComposeDraft } from '../../../services/drafts';
import { useResetStateOnBlurSuccess } from '../../../shared/hooks/useResetStateOnBlurSuccess';
import { SUCCESS_MESSAGES } from '../../../utils/errorHandling';
import { validateDecryptionForm } from '../../../utils/validation';
import { getDefaultSelectedPrivateKey } from '../../keys/domain/keyUtils';
import { normalizeArmor, validateArmor } from '../../keys/domain/pgpValidation';
import { pgpCryptoService } from '../../../services/pgpCryptoService';
import {
  getFirstSelectedKeyId,
  hasSelectedKeys,
  isPassphraseRequired,
} from '../domain/decryptDomain';
import type { KeySelectionMap } from '../model/types';
import { decryptReducer, initialDecryptState } from '../state/decryptReducer';
import { useSecureCopy } from '../../../shared/hooks/useSecureCopy';

export function useDecryptPage() {
  const route = useRoute<DecryptScreenRouteProp>();
  const { secureCopy } = useSecureCopy();
  const navigation = useNavigation<RootNavigationProps>();
  const { user, isAuthLoading, userDecrypted, visibleKeys } = useAuth();
  const { showToast } = useToast();
  const { beginOperation } = useOperationCenter();
  const [state, dispatch] = useReducer(decryptReducer, initialDecryptState);

  const pickFile = useFilePicker(['.txt', '.asc', '.pgp', '.gpg'], 'message');
  const keySelectionKeys = visibleKeys;
  const privateKeys = keySelectionKeys.filter(key => key.privateKey);
  const shouldRedirectToKeys = Boolean(userDecrypted && !isAuthLoading && privateKeys.length === 0);

  const { isRedirecting: isRedirectingToKeys } = useKeyPrerequisiteRedirect(
    shouldRedirectToKeys,
    'Create or import a private key before decrypting.',
    { screen: 'Key', params: { action: 'create' } },
    navigation,
  );

  useResetStateOnBlurSuccess(
    state.wasSuccessful,
    () => dispatch({ type: 'resetAfterSuccess' }),
  );

  // Persist the pasted ciphertext as an encrypted draft so an interrupted or
  // failed decrypt doesn't lose it. Cleared on success.
  useEncryptedComposeDraft({
    userId: user?.uid,
    slot: 'decrypt',
    value: state.encryptedContent,
    shouldClear: state.wasSuccessful,
    onRestore: draft => dispatch({ type: 'encryptedContentChanged', content: draft }),
  });

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

  useEffect(() => {
    if (route.params?.text) {
      dispatch({ type: 'encryptedContentChanged', content: route.params.text });
    }
  }, [route.params?.text]);

  useEffect(() => {
    const required = isPassphraseRequired(keySelectionKeys, state.selectedPrivateKey);
    dispatch({ type: 'passphraseRequiredChanged', required });
  }, [keySelectionKeys, state.selectedPrivateKey]);

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
    const encryptedContent = state.encryptedContent.trim();
    // Re-armor collapsed pastes (line breaks removed by mail/SMS clients or
    // automation) so both validation and OpenPGP parsing succeed.
    const normalizedEncryptedContent = normalizeArmor(encryptedContent, 'MESSAGE') ?? encryptedContent;
    const detachedSignature = state.signature.trim();

    if (normalizedEncryptedContent !== state.encryptedContent) {
      dispatch({ type: 'encryptedContentChanged', content: normalizedEncryptedContent });
    }
    if (detachedSignature !== state.signature) {
      dispatch({ type: 'signatureChanged', signature: detachedSignature });
    }

    const formErrors = validateDecryptionForm(encryptedContent, state.selectedPrivateKey);
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

      const senderUserIds = Object.keys(state.selectedPublicKeys)
        .map(fp => keySelectionKeys.find(key => key.fingerprint === fp)?.userId);
      const recipientUserId = privateKeyId
        ? privateKeys.find(key => key.fingerprint === privateKeyId)?.userId
        : undefined;
      const operationDetail = [
        senderUserIds.length ? `From ${formatKeyUserIds(senderUserIds)}` : null,
        recipientUserId ? `To ${recipientUserId.trim()}` : null,
      ].filter(Boolean).join(' · ');

      const { decrypted, embeddedStatus, detachedStatus } = await beginOperation({
        kind: 'text-decrypt',
        title: 'Decrypting message',
        detail: operationDetail || undefined,
        run: async api => {
          const result = await pgpCryptoService.decryptMessage(
            normalizedEncryptedContent,
            state.selectedPrivateKey[privateKeyId || ''],
            state.passphrase,
            hasSelectedKeys(state.selectedPublicKeys) ? publicKeyArmored : undefined,
          );

          // Resolve signature status inside the operation so the modal shows
          // the verification outcome alongside the decrypted result.
          let nextEmbeddedStatus: 'valid' | 'invalid' | 'unknown' = 'unknown';
          let nextDetachedStatus: 'valid' | 'invalid' | 'unknown' = 'unknown';

          if (hasSelectedKeys(state.selectedPublicKeys)) {
            if (state.useDetachedVerification) {
              if (detachedSignature.length > 0 && publicKeyArmored) {
                const isValid = await pgpCryptoService.verifyDetachedSignature(
                  detachedSignature,
                  result.decrypted,
                  publicKeyArmored,
                );
                nextDetachedStatus = isValid ? 'valid' : 'invalid';
              } else {
                nextDetachedStatus = 'unknown';
              }
            }

            nextEmbeddedStatus = result.verified === true
              ? 'valid'
              : result.verified === false
                ? 'invalid'
                : 'unknown';
          }

          api.succeed(
            {
              decryptedContent: result.decrypted,
              embeddedSignatureStatus: nextEmbeddedStatus,
              detachedSignatureStatus: nextDetachedStatus,
            },
            'Message decrypted',
          );
          return {
            decrypted: result.decrypted,
            embeddedStatus: nextEmbeddedStatus,
            detachedStatus: nextDetachedStatus,
          };
        },
      });

      dispatch({ type: 'decryptedContentSet', content: decrypted });
      dispatch({ type: 'embeddedSignatureStatusChanged', status: embeddedStatus });
      dispatch({ type: 'detachedSignatureStatusChanged', status: detachedStatus });
      // Result lives in the operation modal; clear the composer so the
      // ciphertext and passphrase don't linger on screen.
      dispatch({ type: 'resetAfterSuccess' });
      showToast('Decryption successful!', 'success');

    } catch {
      showToast('Failed to decrypt the message', 'error');
    } finally {
      dispatch({ type: 'decryptFinished' });
    }
  };

  const handleCopy = () => {
    void secureCopy(state.decryptedContent, { sensitivity: 'medium' });
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

  // The selected sender key (decrypt 'Sender' picker) is a KeyPair in
  // visibleKeys; surface its `verified` flag so the result can show trust.
  const senderKeyFingerprint = hasSelectedKeys(state.selectedPublicKeys)
    ? getFirstSelectedKeyId(state.selectedPublicKeys)
    : undefined;
  const senderVerified = senderKeyFingerprint
    ? visibleKeys.find(k => k.fingerprint === senderKeyFingerprint)?.verified === true
    : undefined;

  return {
    state,
    userDecrypted,
    shouldRedirectToKeys: shouldRedirectToKeys || isRedirectingToKeys,
    isLoadingOverlay: !userDecrypted || isAuthLoading,
    privateKeys,
    publicKeys: keySelectionKeys,
    senderVerified,
    isDecryptDisabled: !hasSelectedKeys(state.selectedPrivateKey) || state.isDecrypting,
    canDecrypt:
      !(!hasSelectedKeys(state.selectedPrivateKey) || state.isDecrypting)
      && (!state.passphraseIsRequired || Boolean(state.passphrase))
      && validateArmor(state.encryptedContent.trim(), 'MESSAGE'),
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
