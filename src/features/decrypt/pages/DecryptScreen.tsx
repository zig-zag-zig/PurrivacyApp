import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import type { ScrollView } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { AutofillDisabledView } from '../../../components/AutofillDisabledView';
import { Button } from '../../../components/Button';
import { FilePickerIcon } from '../../../components/FilePickerIcon';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useGlobalSpinner } from '../../../app/state/GlobalSpinnerContext';
import { theme } from '../../../styles/theme';
import { KeySelection } from '../../keys/components/KeySelection';
import { SettingsOption } from '../../settings/components/SettingsOption';
import { DecryptionResult } from '../components/DecryptionResult';
import { useDecryptPage } from '../hooks/useDecryptPage';

export const DecryptScreen = () => {
  const decryptPage = useDecryptPage();
  const scrollRef = useRef<ScrollView>(null);
  useGlobalSpinner(decryptPage.isLoadingOverlay, { backgroundMode: 'opaque' });

  useEffect(() => {
    if (!decryptPage.state.decryptedContent) return;

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);

    return () => clearTimeout(timeout);
  }, [decryptPage.state.decryptedContent]);

  if (decryptPage.shouldRedirectToKeys) {
    return <ScreenContainer>{null}</ScreenContainer>;
  }

  return (
    <ScreenContainer ref={scrollRef} testID="purrivacy.decrypt.screen">
      <AutofillDisabledView style={styles.autofillScope}>
        <InputField
          label="Encrypted Content"
          testID="purrivacy.decrypt.encryptedContent"
          value={decryptPage.state.encryptedContent}
          onChangeText={decryptPage.onEncryptedContentChanged}
          multiline
          largeText
          trimOnBlur
          error={decryptPage.state.formErrors.encryptedContent}
          rightIcon={
            <FilePickerIcon
              onPress={decryptPage.onPickEncryptedFile}
              accessibilityLabel="Upload encrypted file"
            />
          }
        />

        <KeySelection
          title="Recipient"
          keys={decryptPage.privateKeys}
          selectedKeys={decryptPage.state.selectedPrivateKey}
          setSelectedKeys={decryptPage.onSelectedPrivateKeyChanged}
          showPassphraseField={true}
          onPassphraseChange={decryptPage.onPassphraseChanged}
          setDefaultKey={true}
          optional={false}
          multiSelect={false}
          type="private"
          testIDPrefix="purrivacy.decrypt.recipient"
        />

        <KeySelection
          title="Sender"
          keys={decryptPage.publicKeys}
          selectedKeys={decryptPage.state.selectedPublicKeys}
          setSelectedKeys={decryptPage.onSelectedPublicKeysChanged}
          showPassphraseField={false}
          onPassphraseChange={undefined}
          setDefaultKey={false}
          optional={true}
          multiSelect={false}
          type="public"
          testIDPrefix="purrivacy.decrypt.sender"
        />

        {decryptPage.hasSelectedPublicKeys && (
          <>
            <SettingsOption
              text="Verify with detached signature"
              testID="purrivacy.decrypt.detachedSignature.toggle"
              switchProps={{
                value: decryptPage.state.useDetachedVerification,
                onValueChange: decryptPage.onUseDetachedVerificationChanged,
              }}
              extraText="Uses embedded signature verification if off"
              transparentSwitch={true}
            />

            {decryptPage.state.useDetachedVerification && (
              <InputField
                label="Signature"
                testID="purrivacy.decrypt.detachedSignature"
                value={decryptPage.state.signature}
                onChangeText={decryptPage.onSignatureChanged}
                multiline
                largeText
                trimOnBlur
                rightIcon={
                  <FilePickerIcon
                    onPress={decryptPage.onPickSignatureFile}
                    accessibilityLabel="Upload signature file"
                  />
                }
              />
            )}
          </>
        )}

        <Button
          label="Decrypt"
          onPress={decryptPage.onDecrypt}
          loading={decryptPage.state.isDecrypting}
          disabled={!decryptPage.canDecrypt}
          testID="purrivacy.decrypt.submit"
          icon={<Icon name="lock-open" size={20} color={theme.colors.onPrimary} />}
        />

        {decryptPage.state.decryptedContent && (
          <DecryptionResult
            decryptedContent={decryptPage.state.decryptedContent}
            onCopy={decryptPage.onCopy}
            embeddedSignatureStatus={decryptPage.state.embeddedSignatureStatus}
            detachedSignatureStatus={decryptPage.state.detachedSignatureStatus}
            testIDPrefix="purrivacy.decrypt.result"
          />
        )}
      </AutofillDisabledView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  autofillScope: {
    gap: theme.spacing.md,
  },
});
