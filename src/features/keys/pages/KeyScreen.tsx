import { Keyboard, StyleSheet, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { FilePickerIcon } from '../../../components/FilePickerIcon';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useGlobalSpinner } from '../../../app/state/GlobalSpinnerContext';
import { theme } from '../../../styles/theme';
import { CreateKeyForm } from '../components/CreateKeyForm';
import { KeyItem } from '../components/KeyItem';
import { PassphraseField } from '../components/PassphraseField';
import { useKeyScreen } from '../hooks/useKeyScreen';
import type { KeyAction } from '../model/types';
import { KEY_ARMOR_MAX_LENGTH } from '../../../config/inputLimits';
import { SegmentedActionTabs } from '../../../shared/ui/SegmentedActionTabs';
import type { SegmentedActionTab } from '../../../shared/ui/SegmentedActionTabs';
import { SwitchRow } from '../../../shared/ui/SwitchRow';

const keyActionTabs: Array<SegmentedActionTab<KeyAction>> = [
  { action: 'view', icon: 'list', label: 'Keys' },
  { action: 'create', icon: 'add', label: 'Generate' },
  { action: 'import', icon: 'file-upload', label: 'Import' },
];

export const KeyScreen = () => {
  const keyScreen = useKeyScreen();
  useGlobalSpinner(keyScreen.isResolvingKeys, { backgroundMode: 'opaque' });

  const handleKeyActionChange = (action: KeyAction) => {
    Keyboard.dismiss();
    keyScreen.onKeyActionChanged(action);
  };

  if (keyScreen.isResolvingKeys) {
    return <ScreenContainer>{null}</ScreenContainer>;
  }

  return (
    <ScreenContainer
      testID="purrivacy.key.screen"
      ref={keyScreen.scrollRef}
      onScroll={keyScreen.onScroll}
      scrollEventThrottle={16}
    >
      <SegmentedActionTabs
        tabs={keyActionTabs}
        value={keyScreen.state.keyAction}
        onChange={handleKeyActionChange}
        testIDPrefix="purrivacy.key.action"
      />

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
                  deleting={keyScreen.state.isDeleting}
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
                  testID="purrivacy.key.empty.generate"
                  onPress={() => handleKeyActionChange('create')}
                  icon={<Icon name="add" size={20} color={theme.colors.onPrimary} />}
                  style={styles.emptyButton}
                />
                <Button
                  label="Import"
                  testID="purrivacy.key.empty.import"
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
            testID="purrivacy.key.import.armoredKey"
            value={keyScreen.state.importKey}
            onChangeText={keyScreen.onImportKeyChanged}
            multiline
            largeText
            isIsolated={true}
            allowPasteOverride={true}
            maxLength={KEY_ARMOR_MAX_LENGTH}
            trimOnBlur
            rightIcon={
              <FilePickerIcon
                onPress={keyScreen.onPickImportFile}
                accessibilityLabel="Upload key file"
              />
            }
          />

          {keyScreen.state.importKeyType === 'private' && keyScreen.state.metadata?.privateKeyIsUnlocked === false && (
            <PassphraseField
              label="Passphrase for Private Key"
              onPassphraseChange={keyScreen.onImportPassphraseChanged}
              error={keyScreen.state.importPassphraseError}
              fingerprint={keyScreen.state.metadata.fingerprint}
            />
          )}

          {keyScreen.showImportSetDefaultToggle && (
            <SwitchRow
              value={keyScreen.state.setImportAsDefault}
              onValueChange={keyScreen.onImportSetAsDefaultChanged}
              disabled={!keyScreen.hasDefaultKeyPair}
              required={!keyScreen.hasDefaultKeyPair}
              label="Set as default key pair"
            />
          )}

          <Button
            label="Import Key"
            testID="purrivacy.key.import.submit"
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
