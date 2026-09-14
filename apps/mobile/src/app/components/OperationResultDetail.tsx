import React from 'react';
import { StyleSheet, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { CustomText } from '../../components/CustomText';
import { commonStyles } from '../../styles/commonStyles';
import { theme } from '../../styles/theme';
import { CopyableResultBlock } from '../../shared/ui/CopyableResultBlock';
import { SecureTextDisplay } from '../../features/keys/components/SecureTextDisplay';
import { useCopyFeedback } from '../../shared/hooks/useCopyFeedback';
import { useSecureCopy, type SecureCopyOptions } from '../../shared/hooks/useSecureCopy';
import type { OperationRecord } from '../state/operationCenterState';

/**
 * Result viewer for text operations inside the Activity modal. Encrypt/decrypt
 * results used to render inline at the bottom of their screens; they now live
 * here so a successful run can clear the composer while the output stays
 * reachable (copy / reveal / verification) from one place.
 */

type SignatureStatus = 'valid' | 'invalid' | 'unknown' | undefined;

const statusLabel = (status: SignatureStatus): { text: string; color: string; icon: React.ComponentProps<typeof Icon>['name'] } | null => {
    switch (status) {
        case 'valid': return { text: 'Signature verified', color: theme.colors.success, icon: 'verified' };
        case 'invalid': return { text: 'Invalid signature', color: theme.colors.error, icon: 'gpp-bad' };
        case 'unknown': return { text: 'Signature not verified', color: theme.colors.textMuted, icon: 'gpp-maybe' };
        default: return null;
    }
};

const StatusPill: React.FC<{ status: SignatureStatus; label?: string }> = ({ status, label }) => {
    const info = statusLabel(status);
    if (!info) return null;
    return (
        <View style={styles.pill}>
            <Icon name={info.icon} size={13} color={info.color} />
            <CustomText style={[styles.pillText, { color: info.color }]}>
                {label ? `${label}: ${info.text}` : info.text}
            </CustomText>
        </View>
    );
};

const CopyableTextBlock: React.FC<{
    label: string;
    text: string;
    testID?: string;
    secure?: boolean;
    sensitivity?: SecureCopyOptions['sensitivity'];
}> = ({ label, text, testID, secure = false, sensitivity }) => {
    const feedback = useCopyFeedback();
    const { secureCopy } = useSecureCopy();

    // Long-press copies via the app's secure clipboard (per-sensitivity TTL),
    // then flips the "copied" feedback — the flag alone must never be the only
    // thing that happens.
    const handleCopy = () => {
        if (!text) return;
        secureCopy(text, sensitivity ? { sensitivity } : undefined);
        feedback.markCopied();
    };

    return (
        <CopyableResultBlock
            label={label}
            copied={feedback.copied}
            copyTestID={testID ? `${testID}.copy` : undefined}
            onCopy={handleCopy}
            labelTopBackgroundColor={theme.colors.backgroundElevated}
            labelBottomBackgroundColor={theme.colors.surfaceMuted}
        >
            {secure ? (
                <SecureTextDisplay
                    testID={testID ? `${testID}.text` : undefined}
                    text={text}
                    secure
                    style={commonStyles.flex}
                />
            ) : (
                <CustomText
                    testID={testID ? `${testID}.text` : undefined}
                    style={commonStyles.textBody}
                    selectable={false}
                    contextMenuHidden={true}
                >
                    {text}
                </CustomText>
            )}
        </CopyableResultBlock>
    );
};

export const OperationResultDetail: React.FC<{ op: OperationRecord }> = ({ op }) => {
    const result = op.result ?? {};
    const encryptedContent = typeof result.encryptedContent === 'string' ? result.encryptedContent : '';
    const signature = typeof result.signature === 'string' ? result.signature : '';
    const decryptedContent = typeof result.decryptedContent === 'string' ? result.decryptedContent : '';
    const embeddedStatus = result.embeddedSignatureStatus as SignatureStatus;
    const detachedStatus = result.detachedSignatureStatus as SignatureStatus;

    const isDecrypt = op.kind === 'text-decrypt';

    return (
        <View style={styles.container}>
            <View style={styles.heading}>
                <Icon
                    name={isDecrypt ? 'lock-open' : 'lock'}
                    size={18}
                    color={theme.colors.primary}
                />
                <CustomText style={styles.headingText}>
                    {isDecrypt ? 'Decrypted message' : 'Encrypted message'}
                </CustomText>
            </View>

            {op.detail ? <CustomText style={styles.meta}>{op.detail}</CustomText> : null}

            {isDecrypt ? (
                <>
                    <CopyableTextBlock
                        label="Decrypted result"
                        text={decryptedContent}
                        testID="purrivacy.ops.result.decrypted"
                        sensitivity="medium"
                    />
                    <View style={styles.statusRow}>
                        <StatusPill status={embeddedStatus} label="Embedded" />
                        {detachedStatus !== undefined ? (
                            <StatusPill status={detachedStatus} label="Detached" />
                        ) : null}
                    </View>
                </>
            ) : (
                <>
                    <CopyableTextBlock
                        label="Encrypted result"
                        text={encryptedContent}
                        testID="purrivacy.ops.result.encrypted"
                        sensitivity="low"
                    />
                    {signature ? (
                        <CopyableTextBlock
                            label="Detached signature"
                            text={signature}
                            testID="purrivacy.ops.result.signature"
                            sensitivity="low"
                        />
                    ) : null}
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        gap: theme.spacing.sm,
    },
    heading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
    },
    headingText: {
        color: theme.colors.text,
        fontSize: 15,
        fontWeight: '700',
    },
    meta: {
        color: theme.colors.textSecondary,
        fontSize: 12,
    },
    statusRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    pillText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
