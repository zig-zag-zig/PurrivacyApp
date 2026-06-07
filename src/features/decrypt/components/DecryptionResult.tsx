import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { SecureTextDisplay } from '../../keys/components/SecureTextDisplay';
import { CustomText } from '../../../components/CustomText';

interface DecryptionResultProps {
    decryptedContent: string;
    onCopy: () => void;
    embeddedSignatureStatus?: 'valid' | 'invalid' | 'unknown';
    detachedSignatureStatus?: 'valid' | 'invalid' | 'unknown';
    testIDPrefix?: string;
}

export const DecryptionResult: React.FC<DecryptionResultProps> = ({
    decryptedContent,
    onCopy,
    embeddedSignatureStatus = 'unknown',
    detachedSignatureStatus,
    testIDPrefix,
}) => {
    const [copied, setCopied] = useState(false);
    const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
    }, []);

    const handleCopy = () => {
        onCopy();
        setCopied(true);
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
        copyFeedbackTimeoutRef.current = setTimeout(() => {
            setCopied(false);
            copyFeedbackTimeoutRef.current = null;
        }, 1600);
    };

    return (
        <View style={commonStyles.resultContainer}>
            <View style={commonStyles.labeledResultBlock}>
                <CustomText style={commonStyles.labeledResultLabel}>Decrypted result</CustomText>
                <TouchableOpacity
                    testID={testIDPrefix ? `${testIDPrefix}.copy` : undefined}
                    onLongPress={handleCopy}
                    delayLongPress={500}
                    style={[commonStyles.resultContent, commonStyles.flex, copied && styles.resultContentCopied]}
                    activeOpacity={0.7}
                >
                    <SecureTextDisplay
                        testID={testIDPrefix ? `${testIDPrefix}.text` : undefined}
                        text={decryptedContent}
                        secure={false}
                        style={[commonStyles.flex, copied && styles.resultContentCopied]}
                    />
                </TouchableOpacity>
            </View>

            {embeddedSignatureStatus !== 'unknown' ? (
                <View style={commonStyles.signatureRow}>
                    <Icon
                        name={embeddedSignatureStatus === 'valid' ? 'verified' : 'error'}
                        size={18}
                        color={embeddedSignatureStatus === 'valid' ? theme.colors.success : theme.colors.error}
                    />
                    <CustomText style={[commonStyles.textBody, { marginLeft: theme.spacing.xs, color: embeddedSignatureStatus === 'valid' ? theme.colors.success : theme.colors.error }]}>
                        {embeddedSignatureStatus === 'valid' ? 'Embedded signature valid' : 'Embedded signature invalid'}
                    </CustomText>
                </View>
            ) : null}

            {detachedSignatureStatus !== 'unknown' ? (
                <View style={commonStyles.signatureRow}>
                    <Icon
                        name={detachedSignatureStatus === 'valid' ? 'verified' : 'error'}
                        size={18}
                        color={detachedSignatureStatus === 'valid' ? theme.colors.success : theme.colors.error}
                    />
                    <CustomText style={[commonStyles.textBody, { marginLeft: theme.spacing.xs, color: detachedSignatureStatus === 'valid' ? theme.colors.success : theme.colors.error }]}>
                        {detachedSignatureStatus === 'valid' ? 'Detached signature valid' : 'Detached signature invalid'}
                    </CustomText>
                </View>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    resultContentCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
});
