import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { ModalToastHost } from '../../../components/ModalToastHost';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';

type PassphraseStorageConsentModalProps = {
  visible: boolean;
  onStore: () => void;
  onCancel: () => void;
};

export const PassphraseStorageConsentModal = ({
  visible,
  onStore,
  onCancel,
}: PassphraseStorageConsentModalProps) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onCancel}
  >
    <View style={commonStyles.modalOverlay}>
      <View style={styles.centeringContainer}>
        <View style={styles.dialog}>
          <View style={styles.iconCircle}>
            <Icon name="vpn-key" size={30} color={theme.colors.primary} />
          </View>

          <CustomText style={styles.title}>Store passphrases?</CustomText>
          <CustomText style={styles.message}>
            Autofill saved key passphrases on this device.
          </CustomText>

          <View style={styles.actions}>
            <Button
              label="Not now"
              onPress={onCancel}
              variant="secondary"
              style={commonStyles.flex}
              size="compact"
            />
            <Button
              label="Store"
              onPress={onStore}
              style={commonStyles.flex}
              size="compact"
            />
          </View>
        </View>
      </View>
    </View>
    <ModalToastHost />
  </Modal>
);

const styles = StyleSheet.create({
  centeringContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  dialog: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.divider,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    maxWidth: 400,
    padding: theme.spacing.lg,
    width: '100%',
    ...theme.elevation.high,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(187, 134, 252, 0.12)',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    width: 56,
  },
  title: {
    ...commonStyles.textTitle,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...commonStyles.textBody,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: '100%',
  },
});
