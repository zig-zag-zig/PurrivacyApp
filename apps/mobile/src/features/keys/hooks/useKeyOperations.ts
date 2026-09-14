import type { Dispatch } from 'react';
import type { User } from 'firebase/auth';

import { useFilePicker } from '../../../shared/hooks/useFilePicker';
import { pgpCryptoService } from '../../../services/pgpCryptoService';
import type { KeyGenerationOptions, KeyPair, UserDecrypted } from '../../../types/types';
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  getUserFacingErrorMessage,
} from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
import type { ToastType } from '../../../app/state/ToastContext';
import { EventService } from '../../../services/eventService';
import { usePassphraseStorageConsent } from '../../security/hooks/usePassphraseStorageConsent';
import { identifyKeyType, normalizeArmor } from '../domain/pgpValidation';
import {
  changeDevTempKeyExpiration,
  changeDevTempKeyPassphrase,
  clearDevTempKeyDefault,
  deleteDevTempKey,
  isDevTempKey,
  isDevTempKeyFingerprint,
  setDefaultDevTempKey,
} from '../domain/tempKeyFixtures';
import type { KeysUiState } from '../model/types';
import { PgpKeyService } from '../services/pgpKeyService';
import { useOperationCenter } from '../../../app/state/OperationCenterContext';
import type { KeyScreenAction } from '../state/keyScreenReducer';

type ShowToast = (message: string, type: ToastType) => void;

type KeyOperationsParams = {
  user: User | null;
  userDecrypted: UserDecrypted | null;
  state: KeysUiState;
  dispatch: Dispatch<KeyScreenAction>;
  setLoading: (isLoading: boolean) => void;
  showToast: ShowToast;
};

export function useKeyOperations({
  user,
  userDecrypted,
  state,
  dispatch,
  setLoading,
  showToast,
}: KeyOperationsParams) {
  const pickFile = useFilePicker(['.txt', '.asc', '.pgp', '.gpg'], 'key');
  const ensurePassphraseStorageConsent = usePassphraseStorageConsent(user?.uid);
  const { beginOperation } = useOperationCenter();
  const refreshUserKeys = () => EventService.addEvent('user');
  const refreshDevTempKeys = () => EventService.addEvent('devTempKeys');

  const onCreateKey = async (
    keyGenerationOptions: KeyGenerationOptions,
    setAsDefault?: boolean,
  ) => {
    if (!user) return;

    setLoading(true);
    try {
      if (keyGenerationOptions.passphrase) {
        ensurePassphraseStorageConsent().catch(() => {});
      }
      // Key generation is one of the longest operations in the app (up to
      // minutes for large RSA strengths). Register it with the operation
      // center so it stays visible and keeps running across navigation,
      // inactivity lock, or backgrounding.
      await beginOperation({
        kind: 'key-generate',
        title: 'Generating key',
        detail: keyGenerationOptions.name || keyGenerationOptions.email || undefined,
        run: async api => {
          const bits = keyGenerationOptions.bitStrength;
          api.setPhase(bits ? `Generating ${bits}-bit key` : 'Generating key');
          const key = await PgpKeyService.createKey(
            user.uid,
            keyGenerationOptions,
            setAsDefault,
            keyGenerationOptions.passphrase || null,
          );

          if (!key) {
            throw new Error('Key generation did not return a key');
          }

          api.succeed(
            { fingerprint: key.fingerprint },
            key.userId?.trim() || 'Key created',
          );
          dispatch({ type: 'optimisticKeyAdded', key });
          dispatch({ type: 'keyActionChanged', keyAction: 'view' });
          dispatch({ type: 'formResetIncremented' });
          refreshUserKeys();
          showToast(SUCCESS_MESSAGES.KEY_CREATED, 'success');
        },
      });
    } catch (error: any) {
      logger.warn('key creation failed', { error });
      showToast(getUserFacingErrorMessage(error, ERROR_MESSAGES.KEY_CREATE_FAILED), 'error');
    }
    setLoading(false);
  };

  const onImportKey = async (keyContent: string) => {
    if (!user) return;

    const trimmedContent = keyContent.trim();
    dispatch({ type: 'importPassphraseErrorChanged', importPassphraseError: '' });

    if (trimmedContent === '') {
      showToast(ERROR_MESSAGES.ENTER_KEY_TO_IMPORT, 'error');
      return;
    }

    // Re-armor collapsed pastes (line breaks stripped by mail/SMS clients or
    // automation) so OpenPGP parsing succeeds.
    const normalizedKey = normalizeArmor(trimmedContent, 'PRIVATE KEY BLOCK')
      ?? normalizeArmor(trimmedContent, 'PUBLIC KEY BLOCK')
      ?? trimmedContent;

    const keyType = identifyKeyType(normalizedKey);
    if (keyType === 'unknown') {
      showToast(ERROR_MESSAGES.INVALID_KEY_FORMAT, 'error');
      return;
    }

    if (keyType === 'message') {
      showToast(ERROR_MESSAGES.CANNOT_IMPORT_MESSAGE, 'error');
      return;
    }

    const metadata = await pgpCryptoService.extractKeyMetadata(normalizedKey);
    dispatch({ type: 'metadataChanged', metadata });

    const existingKey = userDecrypted?.keys.find(key => key.fingerprint === metadata.fingerprint);

    if (keyType === 'private') {
      setLoading(true);
      try {
        const validPassphrase = await pgpCryptoService.validatePrivateKeyPassphrase(
          normalizedKey,
          state.importPassphrase,
        );

        if (!validPassphrase) {
          dispatch({
            type: 'importPassphraseErrorChanged',
            importPassphraseError: 'Incorrect passphrase for this private key',
          });
          return;
        }
      } catch {
        dispatch({
          type: 'importPassphraseErrorChanged',
          importPassphraseError: 'Failed to validate passphrase',
        });
        return;
      } finally {
        setLoading(false);
      }

      setLoading(true);
      try {
        if (state.importPassphrase) {
          ensurePassphraseStorageConsent().catch(() => {});
        }
        const importedKey = await PgpKeyService.importKey(
          user.uid,
          normalizedKey,
          existingKey?.publicKey,
          state.setImportAsDefault,
          state.importPassphrase || null,
        );

        if (importedKey) {
          dispatch({ type: 'optimisticKeyAdded', key: importedKey });
          dispatch({ type: 'importFormReset' });
          dispatch({ type: 'keyActionChanged', keyAction: 'view' });
          refreshUserKeys();
          showToast(SUCCESS_MESSAGES.KEY_IMPORTED, 'success');
          return;
        }
      } catch (error: any) {
        logger.warn('key import failed', { error });
        showToast(getUserFacingErrorMessage(error, ERROR_MESSAGES.KEY_IMPORT_FAILED), 'error');
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const importedKey = await PgpKeyService.importKey(
        user.uid,
        normalizedKey,
        existingKey?.privateKey,
        state.setImportAsDefault,
      );

      if (importedKey) {
        dispatch({ type: 'optimisticKeyAdded', key: importedKey });
        dispatch({ type: 'importFormReset' });
        dispatch({ type: 'keyActionChanged', keyAction: 'view' });
        refreshUserKeys();
        showToast(SUCCESS_MESSAGES.KEY_IMPORTED, 'success');
        return;
      }
    } catch (error: any) {
      logger.warn('key import failed', { error });
      showToast(getUserFacingErrorMessage(error, ERROR_MESSAGES.KEY_IMPORT_FAILED), 'error');
    }
    setLoading(false);
  };

  const onDeleteKey = async (key: KeyPair) => {
    if (!user) return;

    dispatch({ type: 'deletingChanged', isDeleting: true });
    try {
      if (isDevTempKey(key)) {
        await deleteDevTempKey(key.fingerprint);
        dispatch({ type: 'optimisticKeyRemoved', fingerprint: key.fingerprint });
        refreshDevTempKeys();
        showToast('Key deleted successfully', 'success');
        return;
      }

      await PgpKeyService.deleteKey(user.uid, key);
      dispatch({ type: 'optimisticKeyRemoved', fingerprint: key.fingerprint });
      refreshUserKeys();
      showToast('Key deleted successfully', 'success');
    } catch (error: any) {
      showToast(getUserFacingErrorMessage(error, 'Failed to delete key'), 'error');
    } finally {
      dispatch({ type: 'deletingChanged', isDeleting: false });
    }
  };

  const onSetDefaultKey = async (key: KeyPair) => {
    if (!user) return;

    dispatch({ type: 'loadingChanged', isLoading: true });
    try {
      if (isDevTempKey(key)) {
        await setDefaultDevTempKey(key.fingerprint);
        refreshDevTempKeys();
        showToast('Default key updated successfully', 'success');
        return;
      }

      await PgpKeyService.setDefaultKey(user.uid, key.fingerprint);
      await clearDevTempKeyDefault();
      refreshDevTempKeys();
      refreshUserKeys();
      showToast('Default key updated successfully', 'success');
    } catch (error: any) {
      showToast(getUserFacingErrorMessage(error, 'Failed to set default key'), 'error');
    } finally {
      dispatch({ type: 'loadingChanged', isLoading: false });
    }
  };

  const onChangePassphrase = async (
    fingerprint: string,
    oldPassphrase: string,
    newPassphrase: string,
    newPassphraseConfirm: string,
  ) => {
    if (!user) return;

    dispatch({ type: 'loadingChanged', isLoading: true });
    try {
      if (isDevTempKeyFingerprint(fingerprint)) {
        await changeDevTempKeyPassphrase(
          fingerprint,
          oldPassphrase,
          newPassphrase,
          newPassphraseConfirm,
        );
        refreshDevTempKeys();
        showToast('Passphrase updated', 'success');
        return;
      }

      await PgpKeyService.changePassphrase(
        user.uid,
        fingerprint,
        oldPassphrase,
        newPassphrase,
        newPassphraseConfirm,
      );
      refreshUserKeys();
      showToast('Passphrase updated', 'success');
    } catch (error: any) {
      showToast(getUserFacingErrorMessage(error, 'Failed to update passphrase'), 'error');
    } finally {
      dispatch({ type: 'loadingChanged', isLoading: false });
    }
  };

  const onChangeExpiration = async (
    fingerprint: string,
    passphrase: string,
    days: string,
  ) => {
    if (!user) return;

    dispatch({ type: 'loadingChanged', isLoading: true });
    try {
      if (isDevTempKeyFingerprint(fingerprint)) {
        await changeDevTempKeyExpiration(fingerprint, passphrase, days);
        refreshDevTempKeys();
        showToast('Expiration updated', 'success');
        return;
      }

      await PgpKeyService.changeExpiration(user.uid, fingerprint, passphrase, days);
      refreshUserKeys();
      showToast('Expiration updated', 'success');
    } catch (error: any) {
      showToast(getUserFacingErrorMessage(error, 'Failed to update expiration'), 'error');
    } finally {
      dispatch({ type: 'loadingChanged', isLoading: false });
    }
  };

  const onRevokeKey = async (fingerprint: string, passphrase: string) => {
    if (!user) return;

    if (isDevTempKeyFingerprint(fingerprint)) {
      showToast('Temporary keys cannot be revoked', 'error');
      return;
    }

    dispatch({ type: 'loadingChanged', isLoading: true });
    try {
      await PgpKeyService.revokeKey(user.uid, fingerprint, passphrase);
      refreshUserKeys();
    } catch (error: any) {
      // Re-throw: the caller (useKeyMutationControls) owns the error toast.
      throw error;
    } finally {
      dispatch({ type: 'loadingChanged', isLoading: false });
    }
  };

  const onSetKeyVerified = async (fingerprint: string, verified: boolean) => {
    if (!user) return;
    dispatch({ type: 'loadingChanged', isLoading: true });
    try {
      await PgpKeyService.setKeyVerified(user.uid, fingerprint, verified);
      refreshUserKeys();
    } catch (error: any) {
      throw error;
    } finally {
      dispatch({ type: 'loadingChanged', isLoading: false });
    }
  };

  const onPickImportFile = () => {
    void pickFile(
      content => dispatch({ type: 'importKeyChanged', importKey: content }),
      message => showToast(message, 'error'),
    );
  };

  return {
    onCreateKey,
    onImportKey,
    onDeleteKey,
    onSetDefaultKey,
    onChangePassphrase,
    onChangeExpiration,
    onRevokeKey,
    onSetKeyVerified,
    onPickImportFile,
  };
}
