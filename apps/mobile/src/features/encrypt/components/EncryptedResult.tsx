import React from 'react';
import { View } from 'react-native';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { CustomText } from '../../../components/CustomText';
import { useCopyFeedback } from '../../../shared/hooks/useCopyFeedback';
import { useShareText } from '../../../shared/hooks/useShareText';
import { CopyableResultBlock } from '../../../shared/ui/CopyableResultBlock';

interface EncryptedResultProps {
    encryptedContent: string;
    onCopy: () => void;
    onCopySignature: () => void;
    signature: string;
    testIDPrefix?: string;
}

export const EncryptedResult: React.FC<EncryptedResultProps> = React.memo(({
    encryptedContent,
    onCopy,
    signature,
    onCopySignature,
    testIDPrefix,
}) => {
    const resultCopyFeedback = useCopyFeedback();
    const signatureCopyFeedback = useCopyFeedback();
    const { shareText } = useShareText();

    const handleCopyResult = () => {
        onCopy();
        resultCopyFeedback.markCopied();
    };

    const handleCopySignature = () => {
        onCopySignature();
        signatureCopyFeedback.markCopied();
    };

    return (
        <View style={commonStyles.resultContainer}>
            <CopyableResultBlock
                label="Encrypted result"
                copied={resultCopyFeedback.copied}
                copyTestID={testIDPrefix ? `${testIDPrefix}.copy` : undefined}
                onCopy={handleCopyResult}
                onShare={() => { void shareText(encryptedContent, 'Encrypted message'); }}
                shareTestID={testIDPrefix ? `${testIDPrefix}.share` : undefined}
                shareAccessibilityLabel="Share encrypted result"
            >
                <CustomText
                    testID={testIDPrefix ? `${testIDPrefix}.text` : undefined}
                    style={[commonStyles.textBody, commonStyles.monospaceText]}
                    selectable={false}
                    contextMenuHidden={true}
                >
                    {encryptedContent}
                </CustomText>
            </CopyableResultBlock>

            {signature.trim().length > 0 && (
                <View style={{ marginTop: theme.spacing.md }}>
                    <CopyableResultBlock
                        label="Signature"
                        copied={signatureCopyFeedback.copied}
                        copyTestID={testIDPrefix ? `${testIDPrefix}.signature.copy` : undefined}
                        onCopy={handleCopySignature}
                        onShare={() => { void shareText(signature, 'Signature'); }}
                        shareTestID={testIDPrefix ? `${testIDPrefix}.signature.share` : undefined}
                        shareAccessibilityLabel="Share signature"
                    >
                        <CustomText
                            testID={testIDPrefix ? `${testIDPrefix}.signature.text` : undefined}
                            style={[commonStyles.textBody, commonStyles.monospaceText]}
                            selectable={false}
                            contextMenuHidden={true}
                        >
                            {signature}
                        </CustomText>
                    </CopyableResultBlock>
                </View>
            )}
        </View>
    );
});
