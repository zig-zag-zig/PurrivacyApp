import Icon from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useGlobalSpinner } from '../../../app/state/GlobalSpinnerContext';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { SettingsOption } from '../components/SettingsOption';
import { useSettingsPage } from '../hooks/useSettingsPage';
import { useAppUpdate } from '../../updates/state/UpdateContext';

export const SettingsScreen = () => {
  const settingsPage = useSettingsPage();
  const appUpdate = useAppUpdate();
  useGlobalSpinner(settingsPage.isPageLoading);

  const updateDescription = appUpdate.status === 'available' && appUpdate.latestRelease
    ? `Version ${appUpdate.latestRelease.version} available${appUpdate.skippedReleaseTag === appUpdate.latestRelease.tagName ? ' (skipped on startup)' : ''}`
    : appUpdate.isConfigured
      ? `Current version ${appUpdate.currentVersion}`
      : 'Update source not configured';

  return (
    <ScreenContainer testID="purrivacy.settings.screen">
      <ConfirmationDialog
        visible={settingsPage.state.showDeleteDialog}
        title="Delete Account"
        message="This will permanently delete your account and all associated data including your encryption keys and stored messages."
        itemType="account"
        onConfirm={() => settingsPage.onNavigateToSecurity('delete')}
        onCancel={() => settingsPage.onDeleteDialogChanged(false)}
      />

      <ConfirmationDialog
        visible={settingsPage.state.showRevokeSessionsDialog}
        title="Revoke All Sessions"
        message="This will log you out from all devices and revoke all active sessions. You'll need to sign in again on all devices."
        itemType="sessions"
        onConfirm={settingsPage.onRevokeAllSessions}
        onCancel={() => settingsPage.onRevokeSessionsDialogChanged(false)}
        loading={settingsPage.state.revokeSessionsLoading}
      />

      <ConfirmationDialog
        visible={settingsPage.state.showDisableMfaDialog}
        title="Disable Two-Factor Authentication"
        message="Disabling MFA will make your account less secure. Instead of disabling MFA, you can trust this session to avoid routine MFA prompts until you log out."
        itemType="mfa"
        onConfirm={settingsPage.onDisableMfa}
        onCancel={() => settingsPage.onDisableMfaDialogChanged(false)}
      />

      <ConfirmationDialog
        visible={settingsPage.state.showRegenerateCodesDialog}
        title="Regenerate Recovery Codes"
        message="This will generate new recovery codes and invalidate all existing ones. Make sure to save the new codes in a secure location."
        itemType="recoveryCodes"
        onConfirm={settingsPage.onRegenerateRecoveryCodes}
        onCancel={() => settingsPage.onRegenerateCodesDialogChanged(false)}
      />

      <SettingsOption
        iconName="security"
        text="Two-Factor Authentication"
        switchProps={{
          value: settingsPage.mfaState.mfaEnabled,
          onValueChange: settingsPage.onMfaToggle,
        }}
        extraText={settingsPage.mfaDescription}
      />

      {settingsPage.mfaState.mfaEnabled && (
        <>
          <SettingsOption
            iconName="verified-user"
            text="Session Trusted"
            switchProps={{
              value: settingsPage.mfaState.mfaTrusted,
              onValueChange: settingsPage.onSessionTrustToggle,
            }}
            extraText="A trusted session skips routine MFA prompts until you log out. Sensitive actions still require MFA."
          />

          <View style={styles.recoveryCodesContainer}>
            <View style={styles.recoveryCodesHeader}>
              <View style={[commonStyles.row, { gap: theme.spacing.sm }]}>
                <Icon name="lock-reset" size={24} color={theme.colors.primary} />
                <View style={styles.recoveryCodesHeaderText}>
                  <CustomText style={commonStyles.textLabel}>Recovery Codes</CustomText>
                </View>
              </View>
            </View>

            <CustomText style={[commonStyles.textCaption, styles.recoveryCodesText]}>
              Recovery codes provide backup access if you lose your authenticator app. Each code can be used only once. Store your codes in a secure location.
            </CustomText>

            <View style={styles.recoveryCodesButtons}>
              <Button
                label="Regenerate Codes"
                onPress={() => settingsPage.onRegenerateCodesDialogChanged(true)}
                style={styles.recoveryCodeButton}
                icon={<Icon name="autorenew" size={20} color={theme.colors.onPrimary} />}
              />

              <Button
                label="Check Remaining"
                onPress={settingsPage.onCheckRemainingRecoveryCodes}
                style={styles.recoveryCodeButton}
                icon={<Icon name="list-alt" size={20} color={theme.colors.onPrimary} />}
              />
            </View>
          </View>
        </>
      )}

      {settingsPage.isBiometricAvailable && (
        <SettingsOption
          iconName="fingerprint"
          text="Biometric Unlock"
          switchProps={{
            value: settingsPage.isBiometricEnabled,
            onValueChange: settingsPage.onBiometricToggle,
          }}
          extraText={
            "Use your device biometrics to unlock the app after local lock."
          }
        />
      )}

      <SettingsOption
        iconName="vpn-key"
        text="Store Passphrases"
        testID="purrivacy.settings.storePassphrases"
        switchProps={{
          value: settingsPage.passphraseStorageEnabled,
          onValueChange: settingsPage.onPassphraseStorageToggle,
        }}
        extraText="Saved key passphrases autofill on this device without another authentication prompt."
      />

      <SettingsOption
        iconName="system-update-alt"
        text="App Updates"
        onPress={() => appUpdate.checkForUpdates({
          showModalOnUpdate: true,
          showModalWhenCurrent: true,
        })}
        loading={appUpdate.isChecking}
        disabled={!appUpdate.isConfigured}
        extraText={updateDescription}
      />

      <SettingsOption
        iconName="lock-reset"
        text="Change Password"
        onPress={() => settingsPage.onNavigateToSecurity('password')}
      />
      <SettingsOption
        iconName="delete-forever"
        text="Delete Account"
        onPress={() => settingsPage.onDeleteDialogChanged(true)}
      />
      <SettingsOption
        iconName="logout"
        text="Revoke All Sessions"
        onPress={() => settingsPage.onRevokeSessionsDialogChanged(true)}
        extraText="Logs out all your devices and revokes all active sessions. You'll need to sign in again on all devices."
      />
      <SettingsOption
        iconName="exit-to-app"
        text="Logout"
        testID="purrivacy.settings.logout"
        onPress={settingsPage.onLogout}
        disabled={settingsPage.state.logoutLoading}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  recoveryCodesContainer: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  recoveryCodesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  recoveryCodesHeaderText: {
    ...commonStyles.flex,
  },
  recoveryCodesText: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 18,
  },
  recoveryCodesButtons: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  recoveryCodeButton: {
    ...commonStyles.flex,
  },
});
