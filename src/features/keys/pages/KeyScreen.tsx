import { Keyboard, StyleSheet, Switch, View, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { FilePickerIcon } from '../../../components/FilePickerIcon';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { Spinner } from '../../../components/Spinner';
import { theme } from '../../../styles/theme';
import { CreateKeyForm } from '../components/CreateKeyForm';
import { KeyItem } from '../components/KeyItem';
import { PassphraseField } from '../components/PassphraseField';
import { useKeyScreen } from '../hooks/useKeyScreen';
import type { KeyAction } from '../model/types';

type MaterialIconName = ComponentProps<typeof Icon>['name'];

const keyActionTabs: { action: KeyAction; icon: MaterialIconName; label: string }[] = [
  { action: 'view', icon: 'list', label: 'Keys' },
  { action: 'create', icon: 'add', label: 'Generate' },
  { action: 'import', icon: 'file-upload', label: 'Import' },
];

export const KeyScreen = () => {
  const keyScreen = useKeyScreen();

  const handleKeyActionChange = (action: KeyAction) => {
    Keyboard.dismiss();
    keyScreen.onKeyActionChanged(action);
  };

  if (keyScreen.isResolvingKeys) {
    return (
      <ScreenContainer>
        <Spinner visible />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      ref={keyScreen.scrollRef}
      onScroll={keyScreen.onScroll}
      scrollEventThrottle={16}
    >
      <Spinner visible={keyScreen.isLoadingOverlay} />

      <View style={styles.segmentedControl}>
        {keyActionTabs.map((tab) => {
          const active = keyScreen.state.keyAction === tab.action;
          const tintColor = active ? theme.colors.onPrimary : theme.colors.textSecondary;

          return (
            <TouchableOpacity
              key={tab.action}
              style={[
                styles.segment,
                active && styles.segmentActive,
              ]}
              onPress={() => handleKeyActionChange(tab.action)}
              activeOpacity={0.78}
            >
              <Icon name={tab.icon} size={19} color={tintColor} />
              <CustomText
                style={[
                  styles.segmentText,
                  active && styles.segmentTextActive,
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                {tab.label}
              </CustomText>
            </TouchableOpacity>
          );
        })}
      </View>

      {keyScreen.state.keyAction === 'view' && keyScreen.user && (
        <>
          {keyScreen.sortedKeys.map(key => {
            const expanded = keyScreen.state.expandedKeyFingerprint === key.fingerprint;

            return (
              <View
                key={key.fingerprint}
                ref={node => {
                  keyScreen.itemRefs.current[key.fingerprint] = node;
                }}
              >
                <KeyItem
                  key={`${key.fingerprint}:${expanded ? 'expanded' : 'collapsed'}`}
                  pgpKey={key}
                  onChangePassphrase={keyScreen.onChangePassphrase}
                  onChangeExpiry={keyScreen.onChangeExpiration}
                  onPress={() => keyScreen.onToggleExpandedKey(key.fingerprint)}
                  onSetDefault={() => keyScreen.onSetDefaultKey(key)}
                  onDelete={() => keyScreen.onDeleteKey(key)}
                  expanded={expanded}
                />
              </View>
            );
          })}

          {keyScreen.sortedKeys.length === 0 && (
            <View style={styles.emptyState}>
              <Icon name="vpn-key" size={34} color={theme.colors.primary} />
              <CustomText style={styles.emptyTitle}>No keys yet</CustomText>
              <View style={styles.emptyActions}>
                <Button
                  label="Generate"
                  onPress={() => handleKeyActionChange('create')}
                  icon={<Icon name="add" size={20} color={theme.colors.onPrimary} />}
                  style={styles.emptyButton}
                />
                <Button
                  label="Import"
                  onPress={() => handleKeyActionChange('import')}
                  variant="secondary"
                  icon={<Icon name="file-upload" size={20} color={theme.colors.primary} />}
                  style={styles.emptyButton}
                />
              </View>
            </View>
          )}
        </>
      )}

      <View style={{ display: keyScreen.state.keyAction === 'create' ? 'flex' : 'none' }}>
        <CreateKeyForm
          key={keyScreen.state.formResetKey}
          onCreate={keyScreen.onCreateKey}
          isLoading={keyScreen.state.isLoading}
          hasExistingKeys={(keyScreen.userDecrypted?.keys.length ?? 0) > 0}
          setAsDefault={keyScreen.createSetAsDefaultValue}
          onSetAsDefault={
            keyScreen.createSetAsDefaultDisabled ? undefined : keyScreen.onImportSetAsDefaultChanged
          }
          setAsDefaultDisabled={keyScreen.createSetAsDefaultDisabled}
        />
      </View>

      {keyScreen.state.keyAction === 'import' && (
        <>
          <InputField
            label="PGP Key (Public or Private)"
            value={keyScreen.state.importKey}
            onChangeText={keyScreen.onImportKeyChanged}
            multiline
            largeText
            rightIcon={
              <FilePickerIcon
                onPress={keyScreen.onPickImportFile}
                accessibilityLabel="Upload key file"
              />
            }
          />

          {keyScreen.state.isValidPrivateKey && keyScreen.state.metadata && (
            <PassphraseField
              label="Passphrase for Private Key"
              onPassphraseChange={keyScreen.onImportPassphraseChanged}
              error={keyScreen.state.importPassphraseError}
              hidden={keyScreen.state.metadata.privateKeyIsUnlocked}
              fingerprint={keyScreen.state.metadata.fingerprint}
            />
          )}

          {keyScreen.showImportSetDefaultToggle && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              marginBottom: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}>
              <Switch
                value={keyScreen.state.setImportAsDefault}
                onValueChange={
                  keyScreen.hasDefaultKeyPair ? keyScreen.onImportSetAsDefaultChanged : undefined
                }
                disabled={!keyScreen.hasDefaultKeyPair}
                trackColor={{ false: theme.colors.divider, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
                style={{ marginRight: theme.spacing.sm }}
              />
              <CustomText style={{
                color: !keyScreen.hasDefaultKeyPair ? theme.colors.textSecondary : theme.colors.text,
              }}>
                Set as default key pair
                {!keyScreen.hasDefaultKeyPair ? ' (required)' : ''}
              </CustomText>
            </View>
          )}

          <Button
            label="Import Key"
            onPress={() => keyScreen.onImportKey(keyScreen.state.importKey)}
            disabled={keyScreen.isImportButtonDisabled}
            loading={keyScreen.state.isLoading}
            icon={<Icon name="file-upload" size={20} color={theme.colors.onPrimary} />}
          />
        </>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
  },
  segmentTextActive: {
    color: theme.colors.onPrimary,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  emptyTitle: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  emptyActions: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  emptyButton: {
    marginVertical: 0,
  },
});
