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
import { fileCryptoService, getLastEncryptedFile, writeDeterministicTestFile } from '../../../services/fileCryptoService';
import { getCompleteKeyPairs } from '../../keys/domain/keyUtils';
import { useBinaryFilePicker } from '../../../shared/hooks/useBinaryFilePicker';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { ENV } from '../../../config/env';
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
const isE2E = ENV.appEnv === 'e2e-test';

const E2E_SIZES = [
    { label: '256 KB', bytes: 256 * 1024 },
    { label: '256 KB+1', bytes: 256 * 1024 + 1 },
    { label: '1 MB', bytes: 1024 * 1024 },
    { label: '10 MB', bytes: 10 * 1024 * 1024 },
    { label: '50 MB', bytes: 50 * 1024 * 1024 },
];

export const FileCryptoPanel: React.FC<FileCryptoPanelProps> = ({ mode, testIDPrefix }) => {
    const { visibleKeys } = useAuth();
    const { showToast } = useToast();
    const { pickFile } = useBinaryFilePicker();

    const [picked, setPicked] = useState<{ uri: string; name: string; size?: number; sourceSha256?: string } | null>(null);
    const [e2eSize, setE2eSize] = useState(1024 * 1024);
    const [selectedPublicKeys, setSelectedPublicKeys] = useState<KeySelectionMap>({});
    const [selectedPrivateKey, setSelectedPrivateKey] = useState<KeySelectionMap>({});
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [result, setResult] = useState<{ fileUri: string; fileName: string; totalBytes: number; verified?: boolean | null; sha256?: string; sourceSha256?: string } | null>(null);

    const completePairs = getCompleteKeyPairs(visibleKeys).filter(k => !k.revoked);
    const recipientKeys = visibleKeys.filter(k => !k.revoked);
    const privateKeys = completePairs;

    const selectedPrivateKeyId = Object.keys(selectedPrivateKey)[0];
    const selectedPrivateKeyObj = privateKeys.find(k => k.fingerprint === selectedPrivateKeyId);
    const needsPassphrase = Boolean(
        selectedPrivateKeyObj && selectedPrivateKeyObj.privateKeyIsUnlocked === false,
    );

    const handlePick = async () => {
        if (isE2E) {
            // E2E: bypass the system document picker (SAF UI isn't driveable by
            // Maestro). Encrypt generates a deterministic file in the sandbox;
            // decrypt reuses the file the previous encrypt step produced. The
            // rest of the pipeline (streaming bridge, crypto, backend) is the
            // real code path.
            if (mode === 'decrypt') {
                const latest = getLastEncryptedFile();
                if (!latest) {
                    showToast('No encrypted file available yet', 'error');
                    return;
                }
                setPicked({ uri: latest.uri, name: latest.name, sourceSha256: latest.sourceSha256 });
            } else {
                const generated = writeDeterministicTestFile(e2eSize);
                setPicked({ uri: generated.uri, name: generated.name, size: generated.size, sourceSha256: generated.sha256 });
            }
            setResult(null);
            setErrorText('');
            return;
        }
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
        setErrorText('');
        try {
            if (mode === 'encrypt') {
                const publicKeys = Object.keys(selectedPublicKeys)
                    .map(fp => recipientKeys.find(k => k.fingerprint === fp)?.publicKey)
                    .filter((k): k is string => Boolean(k));
                const signOptions = selectedPrivateKeyObj
                    ? { privateKey: selectedPrivateKeyObj.privateKey!, passphrase }
                    : undefined;
                const out = await fileCryptoService.encryptFile(picked.uri, picked.name, publicKeys, signOptions);
                setResult({ ...out, sourceSha256: picked.sourceSha256 });
                if (!isE2E) await shareResult(out.fileUri);
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
                // Attach the plaintext hash recorded at encrypt time so the e2e
                // verdict can compare it against the decrypted bytes.
                setResult({ ...out, sourceSha256: picked.sourceSha256 });
                if (!isE2E) await shareResult(out.fileUri);
                showToast('File decrypted', 'success');
            }
        } catch (error) {
            const message = getUserFacingErrorMessage(error, mode === 'encrypt' ? 'Failed to encrypt file' : 'Failed to decrypt file');
            const raw = error instanceof Error ? error.message : String(error);
            if (isE2E) console.error('[fileCrypto] operation failed', raw);
            setErrorText(`${message} :: ${raw}`);
            showToast(message, 'error');
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

            {isE2E && mode === 'encrypt' ? (
                <View style={styles.e2eRow}>
                    <CustomText style={styles.e2eLabel}>Test file size</CustomText>
                    <View style={styles.e2eSizes}>
                        {E2E_SIZES.map(size => (
                            <Button
                                key={size.label}
                                label={size.label}
                                size="compact"
                                variant={e2eSize === size.bytes ? 'primary' : 'secondary'}
                                onPress={() => setE2eSize(size.bytes)}
                                testID={testIDPrefix ? `${testIDPrefix}.size.${size.label.replace(/[^a-z0-9]/gi, '')}` : undefined}
                            />
                        ))}
                    </View>
                </View>
            ) : null}
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
                    testID={testIDPrefix ? `${testIDPrefix}.key.passphrase` : undefined}
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

            {isE2E && errorText ? (
                <CustomText
                    style={styles.resultMeta}
                    testID={testIDPrefix ? `${testIDPrefix}.error` : undefined}
                >
                    {errorText}
                </CustomText>
            ) : null}

            {result && (
                <View style={styles.resultCard}>
                    <Icon name="check-circle" size={20} color={theme.colors.success} />
                    <View style={styles.resultText}>
                        <CustomText style={styles.resultName}>{result.fileName}</CustomText>
                        <CustomText style={styles.resultMeta}>{(result.totalBytes / 1024).toFixed(1)} KB written</CustomText>
                        {isE2E ? (
                            <>
                                <CustomText
                                    style={styles.resultMeta}
                                    testID={testIDPrefix ? `${testIDPrefix}.sha256` : undefined}
                                >
                                    {result.sha256}
                                </CustomText>
                                <CustomText
                                    style={styles.resultMeta}
                                    testID={testIDPrefix ? `${testIDPrefix}.fileUri` : undefined}
                                >
                                    {result.fileUri}
                                </CustomText>
                                {mode === 'decrypt' ? (
                                    <CustomText
                                        style={styles.resultMeta}
                                        testID={testIDPrefix ? `${testIDPrefix}.verdict` : undefined}
                                    >
                                        {result.sourceSha256 && result.sha256 === result.sourceSha256 ? 'MATCH' : 'MISMATCH'}
                                    </CustomText>
                                ) : null}
                            </>
                        ) : null}
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
    e2eRow: { gap: theme.spacing.xs },
    e2eLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    e2eSizes: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
    },
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
