import type { Dispatch } from 'react';
import type { User } from 'firebase/auth';

import { useFilePicker } from '../../../hooks/useFilePicker';
import { usePassphraseStorageConsent } from '../../security/hooks/usePassphraseStorageConsent';
import { pgpCryptoService } from '../../../services/pgpCryptoService.';
import type { KeyGenerationOptions, KeyPair, UserDecrypted } from '../../../types/types';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, executeWithLoading } from '../../../utils/errorHandling';
import type { ToastType } from '../../../app/state/ToastContext';
import { securityService } from '../../security/services/securityService';
import { EventService } from '../../../services/eventService';
import { identifyKeyType } from '../domain/pgpValidation';
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
import { PgPKeyService } from '../services/pgpKeyService';
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
  const refreshUserKeys = () => EventService.addEvent('user');
  const refreshDevTempKeys = () => EventService.addEvent('devTempKeys');

  const maybeStorePassphrase = async (
    fingerprint: string,
    passphrase: string,
    options?: { force?: boolean },
  ) => {
    if (!user) return;
    if (passphrase && !await ensurePassphraseStorageConsent()) return;

    await securityService.storePassphrase(
      user.uid,
      { [fingerprint]: passphrase },
      fingerprint,
      options,
    );
  };

  const onCreateKey = async (
    keyGenerationOptions: KeyGenerationOptions,
    setAsDefault?: boolean,
  ) => {
    if (!user) return;

    const shouldStorePassphrase = Boolean(
      keyGenerationOptions.passphrase && await ensurePassphraseStorageConsent(),
    );
    const key = await executeWithLoading(
      () => PgPKeyService.createKey(
        user.uid,
        keyGenerationOptions,
        setAsDefault,
        shouldStorePassphrase ? keyGenerationOptions.passphrase : null,
      ),
      setLoading,
      showToast,
      SUCCESS_MESSAGES.KEY_CREATED,
      ERROR_MESSAGES.KEY_CREATE_FAILED,
    );

    if (key && shouldStorePassphrase) {
      await maybeStorePassphrase(key.fingerprint, keyGenerationOptions.passphrase);
    }

    if (key) {
      refreshUserKeys();
      dispatch({ type: 'keyActionChanged', keyAction: 'view' });
      dispatch({ type: 'formResetIncremented' });
    }
  };

  const onImportKey = async (keyContent: string) => {
    if (!user) return;

    const trimmedContent = keyContent.trim();
    dispatch({ type: 'importPassphraseErrorChanged', importPassphraseError: '' });

    if (trimmedContent === '') {
      showToast(ERROR_MESSAGES.ENTER_KEY_TO_IMPORT, 'error');
      return;
    }

    const keyType = identifyKeyType(trimmedContent);
    if (keyType === 'unknown') {
      showToast(ERROR_MESSAGES.INVALID_KEY_FORMAT, 'error');
      return;
    }

    if (keyType === 'message') {
      showToast(ERROR_MESSAGES.CANNOT_IMPORT_MESSAGE, 'error');
      return;
    }

    const metadata = await pgpCryptoService.extractKeyMetadata(trimmedContent);
    dispatch({ type: 'metadataChanged', metadata });

    const existingKey = userDecrypted?.keys.find(key => key.fingerprint === metadata.fingerprint);

    if (keyType === 'private') {
      setLoading(true);
      try {
        const validPassphrase = await pgpCryptoService.validatePrivateKeyPassphrase(
          trimmedContent,
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

      const shouldStorePassphrase = Boolean(
        state.importPassphrase && await ensurePassphraseStorageConsent(),
      );
      const importedKey = await executeWithLoading(
        () => PgPKeyService.importKey(
          user.uid,
          trimmedContent,
          existingKey?.publicKey,
          state.setImportAsDefault,
          shouldStorePassphrase ? state.importPassphrase : null,
        ),
        setLoading,
        showToast,
        SUCCESS_MESSAGES.KEY_IMPORTED,
        ERROR_MESSAGES.KEY_IMPORT_FAILED,
      );

      if (importedKey && shouldStorePassphrase) {
        await maybeStorePassphrase(importedKey.fingerprint, state.importPassphrase);
      }

      if (importedKey) {
        refreshUserKeys();
        dispatch({ type: 'importFormReset' });
        dispatch({ type: 'keyActionChanged', keyAction: 'view' });
      }

      return;
    }

    const importedKey = await executeWithLoading(
      () => PgPKeyService.importKey(
        user.uid,
        trimmedContent,
        existingKey?.privateKey,
        state.setImportAsDefault,
      ),
      setLoading,
      showToast,
      SUCCESS_MESSAGES.KEY_IMPORTED,
      ERROR_MESSAGES.KEY_IMPORT_FAILED,
    );

    if (importedKey) {
      refreshUserKeys();
      dispatch({ type: 'importFormReset' });
      dispatch({ type: 'keyActionChanged', keyAction: 'view' });
    }
  };

  const onDeleteKey = async (key: KeyPair) => {
    if (!user) return;

    dispatch({ type: 'deletingChanged', isDeleting: true });
    try {
      if (isDevTempKey(key)) {
        await deleteDevTempKey(key.fingerprint);
        await securityService.clearPassphrase(user.uid, key.fingerprint);
        refreshDevTempKeys();
        showToast('Key deleted successfully', 'success');
        return;
      }

      await PgPKeyService.deleteKey(user.uid, key);
      await securityService.clearPassphrase(user.uid, key.fingerprint);
      refreshUserKeys();
      showToast('Key deleted successfully', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to delete key', 'error');
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

      await PgPKeyService.setDefaultKey(user.uid, key.fingerprint);
      await clearDevTempKeyDefault();
      refreshDevTempKeys();
      refreshUserKeys();
      showToast('Default key updated successfully', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to set default key', 'error');
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
        await maybeStorePassphrase(fingerprint, newPassphrase, { force: true });
        refreshDevTempKeys();
        showToast('Passphrase updated', 'success');
        return;
      }

      await PgPKeyService.changePassphrase(
        user.uid,
        fingerprint,
        oldPassphrase,
        newPassphrase,
        newPassphraseConfirm,
      );
      await maybeStorePassphrase(fingerprint, newPassphrase, { force: true });
      refreshUserKeys();
      showToast('Passphrase updated', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to update passphrase', 'error');
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
        await maybeStorePassphrase(fingerprint, passphrase);
        refreshDevTempKeys();
        showToast('Expiration updated', 'success');
        return;
      }

      await PgPKeyService.changeExpiration(user.uid, fingerprint, passphrase, days);
      await maybeStorePassphrase(fingerprint, passphrase);
      refreshUserKeys();
      showToast('Expiration updated', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to update expiration', 'error');
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
    onPickImportFile,
  };
}
