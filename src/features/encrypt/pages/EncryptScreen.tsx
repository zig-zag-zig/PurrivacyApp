import { useEffect, useRef } from 'react';
import type { ScrollView } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { Button } from '../../../components/Button';
import { FilePickerIcon } from '../../../components/FilePickerIcon';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { Spinner } from '../../../components/Spinner';
import { theme } from '../../../styles/theme';
import { KeySelection } from '../../keys/components/KeySelection';
import { SettingsOption } from '../../settings/components/SettingsOption';
import { EncryptedResult } from '../components/EncryptedResult';
import { useEncryptPage } from '../hooks/useEncryptPage';

export const EncryptScreen = () => {
  const encryptPage = useEncryptPage();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!encryptPage.state.encryptedContent) return;

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);

    return () => clearTimeout(timeout);
  }, [encryptPage.state.encryptedContent]);

  if (encryptPage.shouldRedirectToKeys) {
    return (
      <ScreenContainer>
        <Spinner visible />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer ref={scrollRef}>
      <Spinner visible={encryptPage.isLoadingOverlay} />

      <InputField
        label="Text to Encrypt"
        value={encryptPage.state.content}
        onChangeText={encryptPage.onContentChanged}
        autoCapitalize="sentences"
        multiline
        largeText
        error={encryptPage.state.formErrors.content}
        rightIcon={
          <FilePickerIcon
            onPress={encryptPage.onPickContentFile}
            accessibilityLabel="Upload text file"
          />
        }
      />

      <KeySelection
        title="Recipients"
        keys={encryptPage.keySelectionKeys}
        selectedKeys={encryptPage.state.selectedPublicKeys}
        setSelectedKeys={encryptPage.onSelectedPublicKeysChanged}
        multiSelect={true}
        showPassphraseField={false}
        optional={false}
        setDefaultKey={false}
        onPassphraseChange={undefined}
        type="public"
      />

      {encryptPage.state.completeKeyPairs.length > 0 && (
        <KeySelection
          title="Sender"
          keys={encryptPage.state.completeKeyPairs}
          selectedKeys={encryptPage.state.selectedPrivateKey}
          setSelectedKeys={encryptPage.onSelectedPrivateKeyChanged}
          showPassphraseField={true}
          showSignMessageSwitch={true}
          signMessage={encryptPage.state.signMessage}
          setSignMessage={encryptPage.onSignMessageChanged}
          onPassphraseChange={encryptPage.onPassphraseChanged}
          optional={true}
          multiSelect={false}
          setDefaultKey={false}
          type="private"
        />
      )}

      {encryptPage.showIncludePublicKeyToggle && (
        <SettingsOption
          text="Append public key to message"
          transparentSwitch={true}
          switchProps={{
            value: encryptPage.state.includePublicKey,
            onValueChange: encryptPage.onIncludePublicKeyChanged,
          }}
        />
      )}

      <Button
        label="Encrypt"
        onPress={encryptPage.onEncrypt}
        loading={encryptPage.state.isEncrypting}
        disabled={!encryptPage.canEncrypt}
        icon={<Icon name="lock" size={20} color={theme.colors.onPrimary} />}
      />

      {encryptPage.state.encryptedContent && (
        <EncryptedResult
          encryptedContent={encryptPage.state.encryptedContent}
          onCopy={encryptPage.onCopyEncrypted}
          signature={encryptPage.state.signature}
          onCopySignature={encryptPage.onCopySignature}
        />
      )}
    </ScreenContainer>
  );
};
