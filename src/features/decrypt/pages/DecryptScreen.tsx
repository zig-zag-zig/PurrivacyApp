import { useEffect, useRef } from 'react';
import type { ScrollView } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { Button } from '../../../components/Button';
import { FilePickerIcon } from '../../../components/FilePickerIcon';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { Spinner } from '../../../components/Spinner';
import { theme } from '../../../styles/theme';
import { KeySelection } from '../../keys/components/KeySelection';
import { SettingsOption } from '../../settings/components/SettingsOption';
import { DecryptionResult } from '../components/DecryptionResult';
import { useDecryptPage } from '../hooks/useDecryptPage';

export const DecryptScreen = () => {
  const decryptPage = useDecryptPage();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!decryptPage.state.decryptedContent) return;

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);

    return () => clearTimeout(timeout);
  }, [decryptPage.state.decryptedContent]);

  if (decryptPage.shouldRedirectToKeys) {
    return (
      <ScreenContainer>
        <Spinner visible />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer ref={scrollRef}>
      <Spinner visible={decryptPage.isLoadingOverlay} />

      <InputField
        label="Encrypted Content"
        value={decryptPage.state.encryptedContent}
        onChangeText={decryptPage.onEncryptedContentChanged}
        multiline
        largeText
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
      />

      {decryptPage.hasSelectedPublicKeys && (
        <>
          <SettingsOption
            text="Verify with detached signature"
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
              value={decryptPage.state.signature}
              onChangeText={decryptPage.onSignatureChanged}
              multiline
              largeText
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
        icon={<Icon name="lock-open" size={20} color={theme.colors.onPrimary} />}
      />

      {decryptPage.state.decryptedContent && (
        <DecryptionResult
          decryptedContent={decryptPage.state.decryptedContent}
          onCopy={decryptPage.onCopy}
          embeddedSignatureStatus={decryptPage.state.embeddedSignatureStatus}
          detachedSignatureStatus={decryptPage.state.detachedSignatureStatus}
        />
      )}
    </ScreenContainer>
  );
};
