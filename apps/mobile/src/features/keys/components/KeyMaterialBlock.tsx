import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { CustomText } from '../../../components/CustomText';
import { theme } from '../../../styles/theme';

type KeyMaterialBlockProps = {
    copied?: boolean;
    onCopy: () => void;
    text: string;
};

export const KeyMaterialBlock = ({
    copied = false,
    onCopy,
    text,
}: KeyMaterialBlockProps) => (
    <ScrollView
        nestedScrollEnabled
        scrollEnabled
        style={[styles.keyBlock, copied && styles.keyBlockCopied]}
        contentContainerStyle={styles.keyBlockScrollContent}
        onStartShouldSetResponder={() => true}
    >
        <TouchableOpacity
            onLongPress={onCopy}
            delayLongPress={500}
            activeOpacity={0.7}
        >
            <CustomText
                style={styles.keyBlockText}
                selectable={false}
                contextMenuHidden={true}
            >
                {text}
            </CustomText>
        </TouchableOpacity>
    </ScrollView>
);

const styles = StyleSheet.create({
    keyBlock: {
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.md,
        maxHeight: 260,
    },
    keyBlockCopied: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
    },
    keyBlockScrollContent: {
        padding: theme.spacing.md,
    },
    keyBlockText: {
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.textSecondary,
    },
});
