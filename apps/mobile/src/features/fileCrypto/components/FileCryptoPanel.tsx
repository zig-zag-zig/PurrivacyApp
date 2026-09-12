import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import * as Sharing from 'expo-sharing';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { PassphraseField } from '../../keys/components/PassphraseField';
import { KeySelection } from '../../keys/components/KeySelection';
import { useToast } from '../../../app/state/ToastContext';
import { useAuth } from '../../auth/state/AuthContext';
import { fileCryptoService } from '../../../services/fileCryptoService';
import { getCompleteKeyPairs } from '../../keys/domain/keyUtils';
import { useBinaryFilePicker } from '../../../shared/hooks/useBinaryFilePicker';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { theme } from '../../../styles/theme';
import type { KeyPair } from '../../../types/types';
import type { KeySelectionMap } from '../../encrypt/model/types';

type Mode = 'encrypt' | 'decrypt';

interface FileCryptoPanelProps {
    mode: Mode;
    testIDPrefix?: string;
}

/**
 * File-mode encrypt/decrypt panel. Streams a picked file through the chunked
 * WebView bridge (fileCryptoService) and hands the result to the OS share sheet
 * so it lands in a user-chosen destination — matching the "share over
 * clipboard" posture for sensitive output.
 */
export const FileCryptoPanel: React.FC<FileCryptoPanelProps> = ({ mode, testIDPrefix }) => {
    const { visibleKeys } = useAuth();
    const { showToast } = useToast();
    const { pickFile } = useBinaryFilePicker();

    const [picked, setPicked] = useState<{ uri: string; name: string; size?: number } | null>(null);
    const [selectedPublicKeys, setSelectedPublicKeys] = useState<KeySelectionMap>({});
    const [selectedPrivateKey, setSelectedPrivateKey] = useState<KeySelectionMap>({});
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ fileUri: string; fileName: string; totalBytes: number; verified?: boolean | null } | null>(null);

    const completePairs = getCompleteKeyPairs(visibleKeys).filter(k => !k.revoked);
    const recipientKeys = visibleKeys.filter(k => !k.revoked);
    const privateKeys = completePairs;

    const selectedPrivateKeyId = Object.keys(selectedPrivateKey)[0];
    const selectedPrivateKeyObj = privateKeys.find(k => k.fingerprint === selectedPrivateKeyId);
    const needsPassphrase = Boolean(
        selectedPrivateKeyObj && selectedPrivateKeyObj.privateKeyIsUnlocked === false,
    );

    const handlePick = async () => {
        const file = await pickFile();
        if (file) {
            setPicked({ uri: file.uri, name: file.name, size: file.size });
            setResult(null);
        }
    };

    const shareResult = async (fileUri: string) => {
        try {
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            }
        } catch (error) {
            showToast(getUserFacingErrorMessage(error, 'Could not share the file'), 'error');
        }
    };

    const handleRun = async () => {
        if (!picked) return;
        setBusy(true);
        setResult(null);
        try {
            if (mode === 'encrypt') {
                const publicKeys = Object.keys(selectedPublicKeys)
                    .map(fp => recipientKeys.find(k => k.fingerprint === fp)?.publicKey)
                    .filter((k): k is string => Boolean(k));
                const signOptions = selectedPrivateKeyObj
                    ? { privateKey: selectedPrivateKeyObj.privateKey!, passphrase }
                    : undefined;
                const out = await fileCryptoService.encryptFile(picked.uri, picked.name, publicKeys, signOptions);
                setResult(out);
                await shareResult(out.fileUri);
                showToast('File encrypted', 'success');
            } else {
                if (!selectedPrivateKeyObj?.privateKey) {
                    showToast('Select a private key to decrypt with', 'error');
                    return;
                }
                const out = await fileCryptoService.decryptFile(
                    picked.uri,
                    selectedPrivateKeyObj.privateKey,
                    passphrase,
                );
                setResult(out);
                await shareResult(out.fileUri);
                showToast('File decrypted', 'success');
            }
        } catch (error) {
            showToast(getUserFacingErrorMessage(error, mode === 'encrypt' ? 'Failed to encrypt file' : 'Failed to decrypt file'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const canRun = Boolean(
        picked && !busy
        && (mode === 'encrypt'
            ? Object.keys(selectedPublicKeys).length > 0
            : Boolean(selectedPrivateKeyObj) && (!needsPassphrase || passphrase))
    );

    return (
        <View style={styles.container}>
            <Button
                label={picked ? `Change file — ${picked.name}` : 'Choose a file'}
                onPress={handlePick}
                variant="secondary"
                icon={<Icon name="attach-file" size={20} color={theme.colors.primary} />}
                testID={testIDPrefix ? `${testIDPrefix}.pick` : undefined}
            />
            {picked && picked.size != null ? (
                <CustomText style={styles.fileMeta}>{picked.name} · {(picked.size / 1024).toFixed(1)} KB</CustomText>
            ) : null}

            {mode === 'encrypt' ? (
                <KeySelection
                    title="Recipients"
                    keys={recipientKeys}
                    selectedKeys={selectedPublicKeys}
                    setSelectedKeys={setSelectedPublicKeys}
                    multiSelect
                    optional={false}
                    setDefaultKey={false}
                    showPassphraseField={false}
                    onPassphraseChange={undefined}
                    type="public"
                    testIDPrefix={testIDPrefix ? `${testIDPrefix}.recipients` : undefined}
                />
            ) : (
                <KeySelection
                    title="Private key"
                    keys={privateKeys}
                    selectedKeys={selectedPrivateKey}
                    setSelectedKeys={setSelectedPrivateKey}
                    multiSelect={false}
                    optional={false}
                    setDefaultKey={false}
                    showPassphraseField={false}
                    onPassphraseChange={undefined}
                    type="private"
                    testIDPrefix={testIDPrefix ? `${testIDPrefix}.key` : undefined}
                />
            )}

            {(needsPassphrase || (mode === 'encrypt' && selectedPrivateKeyObj)) && (
                <PassphraseField
                    label={mode === 'encrypt' ? 'Signing passphrase (optional)' : 'Key passphrase'}
                    onPassphraseChange={setPassphrase}
                    fingerprint={selectedPrivateKeyObj?.fingerprint}
                />
            )}

            {mode === 'encrypt' && completePairs.length > 0 && (
                <KeySelection
                    title="Sign with (optional)"
                    keys={completePairs}
                    selectedKeys={selectedPrivateKey}
                    setSelectedKeys={setSelectedPrivateKey}
                    multiSelect={false}
                    optional
                    setDefaultKey={false}
                    showPassphraseField={false}
                    onPassphraseChange={undefined}
                    type="private"
                    testIDPrefix={testIDPrefix ? `${testIDPrefix}.signer` : undefined}
                />
            )}

            <Button
                label={mode === 'encrypt' ? 'Encrypt file' : 'Decrypt file'}
                onPress={handleRun}
                loading={busy}
                disabled={!canRun}
                icon={<Icon name={mode === 'encrypt' ? 'lock' : 'lock-open'} size={20} color={theme.colors.onPrimary} />}
                testID={testIDPrefix ? `${testIDPrefix}.run` : undefined}
            />

            {result && (
                <View style={styles.resultCard}>
                    <Icon name="check-circle" size={20} color={theme.colors.success} />
                    <View style={styles.resultText}>
                        <CustomText style={styles.resultName}>{result.fileName}</CustomText>
                        <CustomText style={styles.resultMeta}>{(result.totalBytes / 1024).toFixed(1)} KB written</CustomText>
                    </View>
                    <Button
                        label="Share"
                        onPress={() => shareResult(result.fileUri)}
                        size="compact"
                        variant="secondary"
                        testID={testIDPrefix ? `${testIDPrefix}.share` : undefined}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { gap: theme.spacing.md },
    fileMeta: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        marginTop: -theme.spacing.xs,
    },
    resultCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
    },
    resultText: { flex: 1, minWidth: 0 },
    resultName: { color: theme.colors.text, fontWeight: '600' },
    resultMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
});
