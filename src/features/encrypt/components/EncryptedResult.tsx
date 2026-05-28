import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { CustomText } from '../../../components/CustomText';

interface EncryptedResultProps {
    encryptedContent: string;
    onCopy: () => void;
    onCopySignature: () => void;
    signature: string;
}

export const EncryptedResult: React.FC<EncryptedResultProps> = React.memo(({ encryptedContent, onCopy, signature, onCopySignature }) => {
    const [copiedResult, setCopiedResult] = useState(false);
    const [copiedSignature, setCopiedSignature] = useState(false);
    const resultCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const signatureCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (resultCopyTimeoutRef.current) {
            clearTimeout(resultCopyTimeoutRef.current);
        }
        if (signatureCopyTimeoutRef.current) {
            clearTimeout(signatureCopyTimeoutRef.current);
        }
    }, []);

    const handleCopyResult = () => {
        onCopy();
        setCopiedResult(true);
        if (resultCopyTimeoutRef.current) {
            clearTimeout(resultCopyTimeoutRef.current);
        }
        resultCopyTimeoutRef.current = setTimeout(() => {
            setCopiedResult(false);
            resultCopyTimeoutRef.current = null;
        }, 1600);
    };

    const handleCopySignature = () => {
        onCopySignature();
        setCopiedSignature(true);
        if (signatureCopyTimeoutRef.current) {
            clearTimeout(signatureCopyTimeoutRef.current);
        }
        signatureCopyTimeoutRef.current = setTimeout(() => {
            setCopiedSignature(false);
            signatureCopyTimeoutRef.current = null;
        }, 1600);
    };

    return (
        <View style={commonStyles.resultContainer}>
            <View style={commonStyles.labeledResultBlock}>
                <CustomText style={commonStyles.labeledResultLabel}>Encrypted result</CustomText>
                <TouchableOpacity
                    onLongPress={handleCopyResult}
                    delayLongPress={500}
                    style={[commonStyles.resultContent, copiedResult && styles.resultContentCopied]}
                    activeOpacity={0.7}
                >
                    <CustomText
                        style={[commonStyles.textBody, commonStyles.monospaceText]}
                        selectable={false}
                        contextMenuHidden={true}
                    >
                        {encryptedContent}
                    </CustomText>
                </TouchableOpacity>
            </View>

            {signature.trim().length > 0 && (
                <View style={{ marginTop: theme.spacing.md }}>
                    <View style={commonStyles.labeledResultBlock}>
                        <CustomText style={commonStyles.labeledResultLabel}>Signature</CustomText>
                        <TouchableOpacity
                            onLongPress={handleCopySignature}
                            delayLongPress={500}
                            style={[commonStyles.resultContent, copiedSignature && styles.resultContentCopied]}
                            activeOpacity={0.7}
                        >
                            <CustomText
                                style={[commonStyles.textBody, commonStyles.monospaceText]}
                                selectable={false}
                                contextMenuHidden={true}
                            >
                                {signature}
                            </CustomText>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    resultContentCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
});
