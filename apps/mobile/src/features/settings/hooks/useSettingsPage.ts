import { useNavigation } from '@react-navigation/native';
import { useEffect, useReducer, useState } from 'react';

import { useAuth } from '../../auth/state/AuthContext';
import { useMfa } from '../../mfa/state/MfaContext';
import { useToast } from '../../../app/state/ToastContext';
import type { RootNavigationProps } from '../../../app/navigation/types';
import { ApiClient } from '../../../api/client';
import { getMfaDescription } from '../domain/settingsDomain';
import { initialSettingsState, settingsReducer } from '../state/settingsReducer';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
import { securityService } from '../../security/services/securityService';
import { PgpKeyService } from '../../keys/services/pgpKeyService';
import { EventService } from '../../../services/eventService';

export function useSettingsPage() {
  const navigation = useNavigation<RootNavigationProps>();
  const { signOut, isBiometricAvailable, isBiometricEnabled, toggleBiometric, isAuthLoading, user, userDecrypted } = useAuth();
  const { mfaState, disableMfa, setSessionTrust, regenerateRecoveryCodes, getRemainingRecoveryCodes, isLoading } = useMfa();
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);
  const [passphraseStorageEnabled, setPassphraseStorageEnabledState] = useState(
    () => userDecrypted?.passphraseStorageEnabled ?? false,
  );

  useEffect(() => {
    let cancelled = false;

    const loadPassphraseStoragePreference = async () => {
      if (!user?.uid) {
        setPassphraseStorageEnabledState(false);
        return;
      }

      try {
        const enabled = await securityService.isPassphraseStorageEnabled(user.uid);
        if (!cancelled) {
          setPassphraseStorageEnabledState(enabled);
        }
      } catch (error) {
        logger.warn('failed to load passphrase storage setting', { error });
        if (!cancelled) {
          setPassphraseStorageEnabledState(false);
        }
      }
    };

    void loadPassphraseStoragePreference();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const navigateToSecurity = (type: 'password' | 'delete') => {
    dispatch({ type: 'deleteDialogChanged', visible: false });
    navigation.navigate('Security', { type });
  };

  const navigateToMfaSetup = () => {
    navigation.navigate('MfaSetup');
  };

  const checkRemainingRecoveryCodes = async () => {
    try {
      const response = await getRemainingRecoveryCodes();
      showToast(`You have ${response.remainingCodes} recovery codes remaining`, 'info');
    } catch (error) {
      logger.warn('failed to check remaining recovery codes', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to check remaining recovery codes'), 'error');
    }
  };

  const handleMfaToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        navigateToMfaSetup();
      } else {
        dispatch({ type: 'disableMfaDialogChanged', visible: true });
      }
    } catch (error) {
      logger.warn('failed to toggle mfa', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to toggle MFA'), 'error');
    }
  };

  const handleDisableMfa = async () => {
    dispatch({ type: 'disableMfaLoadingChanged', loading: true });

    try {
      await disableMfa();
      dispatch({ type: 'disableMfaDialogChanged', visible: false });
    } catch (error: any) {
      showToast(getUserFacingErrorMessage(error, 'Failed to disable MFA'), 'error');
    } finally {
      dispatch({ type: 'disableMfaLoadingChanged', loading: false });
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    dispatch({ type: 'regenerateCodesLoadingChanged', loading: true });

    try {
      await regenerateRecoveryCodes();
      dispatch({ type: 'regenerateCodesDialogChanged', visible: false });
    } catch (error: any) {
      logger.warn('failed to regenerate recovery codes', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to regenerate recovery codes'), 'error');
    } finally {
      dispatch({ type: 'regenerateCodesLoadingChanged', loading: false });
    }
  };

  const handleRevokeAllSessions = async () => {
    dispatch({ type: 'revokeSessionsDialogChanged', visible: false });
    dispatch({ type: 'revokeSessionsLoadingChanged', loading: true });

    try {
      await ApiClient.revokeAllSessions();
      showToast('All sessions revoked successfully', 'success');
      await signOut();
    } catch (error: any) {
      logger.warn('failed to revoke all sessions', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to revoke all sessions'), 'error');
    } finally {
      dispatch({ type: 'revokeSessionsLoadingChanged', loading: false });
    }
  };

  const handleSessionTrustToggle = async (value: boolean) => {
    try {
      await setSessionTrust(value);
    } catch (error) {
      logger.warn('failed to toggle session trust', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to toggle session trust'), 'error');
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    dispatch({ type: 'biometricToggleLoadingChanged', loading: true });

    try {
      await toggleBiometric(value);
    } catch (error) {
      logger.warn('failed to toggle biometric', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to toggle biometric unlock'), 'error');
    } finally {
      dispatch({ type: 'biometricToggleLoadingChanged', loading: false });
    }
  };

  const handlePassphraseStorageToggle = async (value: boolean) => {
    if (!user?.uid) return;
    dispatch({ type: 'passphraseStorageLoadingChanged', loading: true });

    try {
      if (value) {
        await securityService.setPassphraseStorageEnabled(user.uid, true);
      } else {
        await PgpKeyService.forgetStoredPassphrases(user.uid);
        EventService.addEvent('user');
      }
      setPassphraseStorageEnabledState(value);
      showToast(
        value ? 'Passphrase storage enabled' : 'Stored passphrases cleared',
        'success',
      );
    } catch (error) {
      logger.warn('failed to toggle passphrase storage', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to update passphrase storage'), 'error');
    } finally {
      dispatch({ type: 'passphraseStorageLoadingChanged', loading: false });
    }
  };

  const handleLogout = async () => {
    dispatch({ type: 'logoutLoadingChanged', loading: true });

    try {
      await signOut();
    } catch (error) {
      logger.warn('failed to log out', { error });
      showToast(getUserFacingErrorMessage(error, 'Failed to log out'), 'error');
      dispatch({ type: 'logoutLoadingChanged', loading: false });
    }
  };

  return {
    state,
    mfaState,
    mfaDescription: getMfaDescription(mfaState.mfaEnabled),
    isBiometricAvailable,
    isBiometricEnabled,
    passphraseStorageEnabled,
    onDeleteDialogChanged: (visible: boolean) => {
      dispatch({ type: 'deleteDialogChanged', visible });
    },
    onDisableMfaDialogChanged: (visible: boolean) => {
      dispatch({ type: 'disableMfaDialogChanged', visible });
    },
    onRevokeSessionsDialogChanged: (visible: boolean) => {
      dispatch({ type: 'revokeSessionsDialogChanged', visible });
    },
    onRegenerateCodesDialogChanged: (visible: boolean) => {
      dispatch({ type: 'regenerateCodesDialogChanged', visible });
    },
    onNavigateToSecurity: navigateToSecurity,
    onMfaToggle: handleMfaToggle,
    onDisableMfa: handleDisableMfa,
    onRegenerateRecoveryCodes: handleRegenerateRecoveryCodes,
    onRevokeAllSessions: handleRevokeAllSessions,
    onCheckRemainingRecoveryCodes: checkRemainingRecoveryCodes,
    onSessionTrustToggle: handleSessionTrustToggle,
    onBiometricToggle: handleBiometricToggle,
    onPassphraseStorageToggle: handlePassphraseStorageToggle,
    onLogout: handleLogout,
  };
}
