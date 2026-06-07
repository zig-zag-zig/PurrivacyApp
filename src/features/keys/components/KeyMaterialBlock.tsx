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
        style={[styles.keyBlock, copied && styles.keyBlockCopied]}
        contentContainerStyle={styles.keyBlockScrollContent}
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
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        maxHeight: 260,
    },
    keyBlockCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
    keyBlockScrollContent: {
        padding: theme.spacing.md,
    },
    keyBlockText: {
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.text,
    },
});
