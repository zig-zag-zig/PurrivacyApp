import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { KeySelection } from '../../keys/components/KeySelection';
import { useToast } from '../../../app/state/ToastContext';
import { useAuth } from '../../auth/state/AuthContext';
import { fileCryptoService, getLastEncryptedFile, writeDeterministicTestFile } from '../../../services/fileCryptoService';
import { useOperationCenter, useLatestOperation } from '../../../app/state/OperationCenterContext';
import { formatBytes } from '../../../app/state/operationCenterState';
import { getCompleteKeyPairs } from '../../keys/domain/keyUtils';
import { useBinaryFilePicker, type PickedBinaryFile } from '../../../shared/hooks/useBinaryFilePicker';
import { runFileBatch } from '../domain/fileBatch';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { ENV } from '../../../config/env';
import { theme } from '../../../styles/theme';
import type { KeyPair } from '../../../types/types';
import type { KeySelectionMap } from '../../encrypt/model/types';

type Mode = 'encrypt' | 'decrypt';
type PickedFile = PickedBinaryFile & { sourceSha256?: string };

interface FileCryptoPanelProps {
    mode: Mode;
    testIDPrefix?: string;
}

/**
 * File-mode encrypt/decrypt panel. Streams picked files through the chunked
 * WebView bridge (fileCryptoService) and hands each result to the OS share
 * sheet so it lands in a user-chosen destination — matching the "share over
 * clipboard" posture for sensitive output.
 *
 * A multi-file selection runs sequentially, one OperationCenter record per
 * file, so each result keeps its own progress/share/open/failure state.
 *
 * Long operations register with the app-wide OperationCenter, so they keep
 * running (and stay visible/restorable) if the user navigates away, the
 * screen unmounts (e.g. inactivity lock), or the app backgrounds.
 */
const isE2E = ENV.appEnv === 'e2e-test';
// e2e builds normally bypass the system picker (SAF is not driveable) — which
// is how the real pick path went uncovered. EXPO_PUBLIC_E2E_REAL_FILE_PICKER=1
// restores it so that path can be exercised end-to-end.
const bypassPicker = isE2E && !ENV.e2eRealFilePicker;

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
    const { pickFile, pickFiles } = useBinaryFilePicker();
    const { beginOperation } = useOperationCenter();
    const opKind = mode === 'encrypt' ? 'file-encrypt' as const : 'file-decrypt' as const;
    const latestOp = useLatestOperation(opKind);

    const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
    const [e2eSize, setE2eSize] = useState(1024 * 1024);
    const [selectedPublicKeys, setSelectedPublicKeys] = useState<KeySelectionMap>({});
    const [selectedPrivateKey, setSelectedPrivateKey] = useState<KeySelectionMap>({});
    const [selectedSenderKey, setSelectedSenderKey] = useState<KeySelectionMap>({});
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [result, setResult] = useState<{ fileUri: string; fileName: string; totalBytes: number; verified?: boolean | null; sha256?: string; sourceSha256?: string; savedUri?: string | null } | null>(null);
    const [selfTestResult, setSelfTestResult] = useState('');
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // e2e/dev perf probe: measures pure WebView crypto throughput (no bridge).
    const handleSelfTest = async () => {
        const key = recipientKeys[0];
        if (!key) return;
        setSelfTestResult('running…');
        try {
            const r = await fileCryptoService.selfTestFileCrypto(5 * 1024 * 1024, key.publicKey);
            const kbs = Math.round((r.inBytes / 1024) / (r.elapsedMs / 1000));
            setSelfTestResult(`webview crypto: ${r.elapsedMs}ms for 5 MB (${kbs} KB/s)`);
        } catch (error) {
            setSelfTestResult(`self test failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    // Restore the outcome of an operation that ran while this panel was not
    // mounted (tab remount, inactivity lock, sign-out/in). The OperationCenter
    // keeps the record; without this the user returns to a blank screen even
    // though the job finished. Applied once per panel lifetime.
    const restoredOpIdRef = useRef<string | null>(null);
    useEffect(() => {
        const op = latestOp;
        if (!op || op.status === 'running') return;
        if (restoredOpIdRef.current === op.id) return;
        restoredOpIdRef.current = op.id;
        if (op.status === 'succeeded' && op.result) {
            const r = op.result as { fileUri?: string; fileName?: string; totalBytes?: number; sha256?: string; sourceSha256?: string; savedUri?: string | null };
            if (r.fileUri && r.fileName) {
                setResult({ fileUri: r.fileUri, fileName: r.fileName, totalBytes: r.totalBytes ?? 0, sha256: r.sha256, sourceSha256: r.sourceSha256, savedUri: r.savedUri ?? null });
            }
        } else if (op.status === 'failed' && op.error) {
            setErrorText(op.error);
        }
    }, [latestOp]);

    // An op started here may finish while the user is elsewhere; keep the run
    // button honest even after a remount mid-operation.
    const opRunning = latestOp?.status === 'running';

    const completePairs = getCompleteKeyPairs(visibleKeys).filter(k => !k.revoked);
    const recipientKeys = visibleKeys.filter(k => !k.revoked);
    const privateKeys = completePairs;

    const selectedPrivateKeyId = Object.keys(selectedPrivateKey)[0];
    const selectedPrivateKeyObj = privateKeys.find(k => k.fingerprint === selectedPrivateKeyId);
    const needsPassphrase = Boolean(
        selectedPrivateKeyObj && selectedPrivateKeyObj.privateKeyIsUnlocked === false,
    );

    const nextE2ePickedFile = (): PickedFile | null => {
        if (mode === 'decrypt') {
            const latest = getLastEncryptedFile();
            if (!latest) {
                showToast('No encrypted file available yet', 'error');
                return null;
            }
            return { uri: latest.uri, name: latest.name, sourceSha256: latest.sourceSha256 };
        }
        const generated = writeDeterministicTestFile(e2eSize);
        return { uri: generated.uri, name: generated.name, size: generated.size, sourceSha256: generated.sha256 };
    };

    const addPickedFiles = (files: PickedFile[]) => {
        setPickedFiles(current => {
            const existing = new Set(current.map(file => file.uri));
            return [...current, ...files.filter(file => !existing.has(file.uri))];
        });
        setResult(null);
        setErrorText('');
    };

    const handlePick = async () => {
        if (bypassPicker) {
            // E2E: bypass the system document picker (SAF UI isn't driveable by
            // Maestro). Encrypt generates a deterministic file in the sandbox;
            // decrypt reuses the file the previous encrypt step produced. The
            // rest of the pipeline (streaming bridge, crypto, backend) is the
            // real code path.
            const file = nextE2ePickedFile();
            if (file) addPickedFiles([file]);
            return;
        }
        // A picker failure used to reject silently (no handler), which looked
        // like "nothing happens" for files the provider could not hand over
        // (some cloud/media providers reject the cache copy).
        try {
            const files = await pickFiles({ multiple: true });
            if (files.length) addPickedFiles(files);
        } catch (error) {
            const raw = error instanceof Error ? error.message : String(error);
            setErrorText(raw);
            showToast(getUserFacingErrorMessage(error, 'Could not open the selected file'), 'error');
        }
    };

    const handleReplaceFile = async (index: number) => {
        if (busy || opRunning) return;
        if (bypassPicker) {
            const file = nextE2ePickedFile();
            if (!file) return;
            setPickedFiles(current => current.map((existing, i) => (i === index ? file : existing)));
            setResult(null);
            setErrorText('');
            return;
        }
        try {
            const file = await pickFile();
            if (file) {
                setPickedFiles(current => current.map((existing, i) => (i === index ? file : existing)));
                setResult(null);
                setErrorText('');
            }
        } catch (error) {
            const raw = error instanceof Error ? error.message : String(error);
            setErrorText(raw);
            showToast(getUserFacingErrorMessage(error, 'Could not open the selected file'), 'error');
        }
    };

    const removePickedFile = (index: number) => {
        setPickedFiles(current => current.filter((_, i) => i !== index));
        setResult(null);
        setErrorText('');
    };

    // After a fully successful run the panel clears itself: the outcome
    // (saved location, hashes, signature status, share/open actions) lives in
    // the operation modal, so leaving the picked files and keys on screen is
    // just clutter — and keeping the plaintext passphrase around is worse.
    const clearForm = () => {
        setPickedFiles([]);
        setSelectedPublicKeys({});
        setSelectedPrivateKey({});
        setSelectedSenderKey({});
        setPassphrase('');
    };

    const handleRun = async () => {
        const files = pickedFiles;
        if (files.length === 0) return;
        setBusy(true);
        setResult(null);
        setErrorText('');
        try {
            // Each file is its own OperationCenter record: it gets its own
            // progress, result, share/open actions, and failure state. Files
            // run sequentially so peak memory and WebView load stay bounded to
            // one streaming session regardless of selection size.
            const { failures } = await runFileBatch(files, async (picked, index) => {
                const batchPosition = files.length > 1 ? ` ${index + 1} of ${files.length}` : '';
                await beginOperation({
                    kind: opKind,
                    title: `${mode === 'encrypt' ? 'Encrypting file' : 'Decrypting file'}${batchPosition}`,
                    detail: picked.name,
                    run: async api => {
                        if (mode === 'encrypt') {
                            const publicKeys = Object.keys(selectedPublicKeys)
                                .map(fp => recipientKeys.find(k => k.fingerprint === fp)?.publicKey)
                                .filter((k): k is string => Boolean(k));
                            const signOptions = selectedPrivateKeyObj
                                ? { privateKey: selectedPrivateKeyObj.privateKey!, passphrase }
                                : undefined;
                            const out = await fileCryptoService.encryptFile(
                                picked.uri,
                                picked.name,
                                publicKeys,
                                signOptions,
                                (done, total) => api.setProgress(done, total),
                            );
                            api.succeed(
                                { fileUri: out.fileUri, fileName: out.fileName, totalBytes: out.totalBytes, sha256: out.sha256, sourceSha256: picked.sourceSha256, savedUri: out.savedUri ?? null },
                                out.savedUri
                                    ? `${out.fileName} · saved to Downloads/Purrivacy`
                                    : `${out.fileName} · ${formatBytes(out.totalBytes)}`,
                            );
                        } else {
                            if (!selectedPrivateKeyObj?.privateKey) {
                                throw new Error('Select a private key to decrypt with');
                            }
                            // Optional sender key: when chosen, the embedded
                            // signature is verified against it and the outcome is
                            // surfaced on the operation (modal badge).
                            const senderPublicKey = recipientKeys
                                .find(k => k.fingerprint === Object.keys(selectedSenderKey)[0])?.publicKey;
                            const out = await fileCryptoService.decryptFile(
                                picked.uri,
                                selectedPrivateKeyObj.privateKey,
                                passphrase,
                                senderPublicKey,
                                (done, total) => api.setProgress(done, total),
                            );
                            // Attach the plaintext hash recorded at encrypt time so the e2e
                            // verdict can compare it against the decrypted bytes.
                            const signature = out.verified === true
                                ? 'signature verified'
                                : out.verified === false
                                    ? 'SIGNATURE INVALID'
                                    : null;
                            api.succeed(
                                { fileUri: out.fileUri, fileName: out.fileName, totalBytes: out.totalBytes, sha256: out.sha256, sourceSha256: picked.sourceSha256, verdict: out.verified ?? null, verified: out.verified ?? null, savedUri: out.savedUri ?? null },
                                [
                                    out.fileName,
                                    signature,
                                    out.savedUri ? 'saved to Downloads/Purrivacy' : formatBytes(out.totalBytes),
                                ].filter(Boolean).join(' · '),
                            );
                        }
                    },
                });
            });

            if (!mountedRef.current) return;
            if (failures.length > 0) {
                // Leave only the files that failed selected, with the chosen
                // key/passphrase intact, so a retry is one tap away.
                const failedIndexes = new Set(failures.map(failure => failure.index));
                const failureDetails = failures.map(({ file, error }) => (
                    `${file.name}: ${error instanceof Error ? error.message : String(error)}`
                ));
                if (isE2E) {
                    failures.forEach(({ error }) => {
                        console.error('[fileCrypto] operation failed', error instanceof Error ? error.message : String(error));
                    });
                }
                setPickedFiles(files.filter((_, index) => failedIndexes.has(index)));
                const action = mode === 'encrypt' ? 'encrypt' : 'decrypt';
                const message = failures.length === files.length
                    ? `Failed to ${action} the selected ${files.length === 1 ? 'file' : 'files'}`
                    : `${failures.length} of ${files.length} files could not be ${action === 'encrypt' ? 'encrypted' : 'decrypted'}`;
                setErrorText(`${message} :: ${failureDetails.join(' | ')}`);
                showToast(message, 'error');
            } else {
                clearForm();
                showToast(
                    mode === 'encrypt'
                        ? (files.length > 1 ? `${files.length} files encrypted` : 'File encrypted')
                        : (files.length > 1 ? `${files.length} files decrypted` : 'File decrypted'),
                    'success',
                );
            }
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    };

    const canRun = Boolean(
        pickedFiles.length > 0 && !busy && !opRunning
        && (mode === 'encrypt'
            ? Object.keys(selectedPublicKeys).length > 0
            : Boolean(selectedPrivateKeyObj) && (!needsPassphrase || passphrase))
    );

    const totalBytes = pickedFiles.every(file => file.size != null)
        ? pickedFiles.reduce((sum, file) => sum + (file.size ?? 0), 0)
        : null;

    return (
        <View style={styles.container}>
            <TouchableOpacity
                onPress={handlePick}
                activeOpacity={0.78}
                disabled={busy || opRunning}
                testID={testIDPrefix ? `${testIDPrefix}.pick` : undefined}
                style={styles.pickButton}
            >
                <View style={styles.pickIconWrap}>
                    <Icon name="attach-file" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.pickText}>
                    <CustomText style={styles.pickLabel} numberOfLines={1}>
                        {pickedFiles.length === 0 ? 'Choose files' : 'Add files'}
                    </CustomText>
                    {pickedFiles.length > 0 ? (
                        <CustomText style={styles.pickMeta} numberOfLines={1}>
                            {totalBytes != null
                                ? `${formatBytes(totalBytes)} total · tap a file to replace`
                                : 'Tap a file to replace'}
                        </CustomText>
                    ) : null}
                </View>
            </TouchableOpacity>

            {pickedFiles.length > 0 ? (
                <View style={styles.fileList}>
                    {pickedFiles.map((file, index) => (
                        <View
                            key={`${file.uri}-${index}`}
                            style={styles.fileRow}
                            testID={testIDPrefix ? `${testIDPrefix}.file.${index}` : undefined}
                        >
                            <TouchableOpacity
                                onPress={() => handleReplaceFile(index)}
                                disabled={busy || opRunning}
                                activeOpacity={0.7}
                                style={styles.fileRowButton}
                                accessibilityLabel={`Replace ${file.name}`}
                                accessibilityRole="button"
                                testID={testIDPrefix ? `${testIDPrefix}.replace.${index}` : undefined}
                            >
                                <Icon name="description" size={18} color={theme.colors.textSecondary} />
                                <View style={styles.fileRowText}>
                                    <CustomText style={styles.fileRowName} numberOfLines={1} ellipsizeMode="middle">
                                        {file.name}
                                    </CustomText>
                                    <CustomText style={styles.fileRowMeta} numberOfLines={1}>
                                        {file.size != null ? formatBytes(file.size) : 'Size unavailable'}
                                    </CustomText>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => removePickedFile(index)}
                                disabled={busy || opRunning}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel={`Remove ${file.name}`}
                                accessibilityRole="button"
                                testID={testIDPrefix ? `${testIDPrefix}.remove.${index}` : undefined}
                            >
                                <Icon name="close" size={18} color={theme.colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            ) : null}

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
            {isE2E && mode === 'encrypt' ? (
                <>
                    <Button
                        label="Self test (5 MB)"
                        onPress={handleSelfTest}
                        variant="secondary"
                        size="compact"
                        testID={testIDPrefix ? `${testIDPrefix}.selftest` : undefined}
                    />
                    {selfTestResult ? (
                        <CustomText
                            style={styles.fileMeta}
                            testID={testIDPrefix ? `${testIDPrefix}.selftest.result` : undefined}
                        >
                            {selfTestResult}
                        </CustomText>
                    ) : null}
                </>
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
                    // Renders the passphrase field inside the card, only when
                    // the key actually needs one, with autofill + stored-
                    // passphrase banner — same as the text decrypt screen.
                    showPassphraseField
                    onPassphraseChange={setPassphrase}
                    passphraseBannerMode="stored"
                    type="private"
                    testIDPrefix={testIDPrefix ? `${testIDPrefix}.key` : undefined}
                />
            )}

            {mode === 'decrypt' && recipientKeys.length > 0 && (
                <KeySelection
                    title="Verify sender (optional)"
                    keys={recipientKeys}
                    selectedKeys={selectedSenderKey}
                    setSelectedKeys={setSelectedSenderKey}
                    multiSelect={false}
                    optional
                    setDefaultKey={false}
                    showPassphraseField={false}
                    onPassphraseChange={undefined}
                    type="public"
                    testIDPrefix={testIDPrefix ? `${testIDPrefix}.sender` : undefined}
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
                    // Field lives inside the card; hidden for unlocked keys.
                    // A locked signer's passphrase is required, so no
                    // "(optional)" label here — the card title carries optionality.
                    showPassphraseField
                    onPassphraseChange={setPassphrase}
                    passphraseBannerMode="stored"
                    type="private"
                    testIDPrefix={testIDPrefix ? `${testIDPrefix}.signer` : undefined}
                />
            )}

            <Button
                label={mode === 'encrypt' ? 'Encrypt file' : 'Decrypt file'}
                onPress={handleRun}
                loading={busy || opRunning}
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

            {isE2E && result && (
                // e2e-only diagnostic text (never rendered in production). The
                // user-facing result lives in the operation modal; these testIDs
                // exist purely so the file roundtrip e2e can read hashes/verdict.
                <>
                    <CustomText
                        style={styles.resultMeta}
                        testID={testIDPrefix ? `${testIDPrefix}.sha256` : undefined}
                    >
                        {result.sha256 ?? ''}
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
    pickButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    pickIconWrap: {
        width: 40,
        height: 40,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    pickLabel: {
        color: theme.colors.text,
        fontWeight: '700',
        fontSize: theme.typography.body.fontSize,
    },
    pickMeta: {
        color: theme.colors.textSecondary,
        fontSize: 12,
    },
    fileList: {
        gap: theme.spacing.xs,
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surfaceMuted,
    },
    fileRowButton: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    fileRowText: {
        flex: 1,
        minWidth: 0,
        gap: 1,
    },
    fileRowName: {
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 13,
    },
    fileRowMeta: {
        color: theme.colors.textSecondary,
        fontSize: 11,
    },
    resultMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
});
