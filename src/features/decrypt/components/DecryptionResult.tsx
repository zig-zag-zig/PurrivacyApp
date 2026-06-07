import React from 'react';
import { View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { SecureTextDisplay } from '../../keys/components/SecureTextDisplay';
import { CustomText } from '../../../components/CustomText';
import { useCopyFeedback } from '../../../shared/hooks/useCopyFeedback';
import { CopyableResultBlock } from '../../../shared/ui/CopyableResultBlock';

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
    const copyFeedback = useCopyFeedback();

    const handleCopy = () => {
        onCopy();
        copyFeedback.markCopied();
    };

    return (
        <View style={commonStyles.resultContainer}>
            <CopyableResultBlock
                label="Decrypted result"
                copied={copyFeedback.copied}
                copyTestID={testIDPrefix ? `${testIDPrefix}.copy` : undefined}
                onCopy={handleCopy}
                contentStyle={commonStyles.flex}
            >
                <SecureTextDisplay
                    testID={testIDPrefix ? `${testIDPrefix}.text` : undefined}
                    text={decryptedContent}
                    secure={false}
                    style={commonStyles.flex}
                />
            </CopyableResultBlock>

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
