import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

import { CustomText } from '../../components/CustomText';
import { commonStyles } from '../../styles/commonStyles';

type CopyableResultBlockProps = {
    children: React.ReactNode;
    copied: boolean;
    copyTestID?: string;
    label: string;
    onCopy: () => void;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
};

export const CopyableResultBlock = ({
    children,
    copied,
    copyTestID,
    label,
    onCopy,
    style,
    contentStyle,
}: CopyableResultBlockProps) => (
    <View style={[commonStyles.labeledResultBlock, style]}>
        <CustomText style={commonStyles.labeledResultLabel}>{label}</CustomText>
        <TouchableOpacity
            testID={copyTestID}
            onLongPress={onCopy}
            delayLongPress={500}
            style={[
                commonStyles.resultContent,
                contentStyle,
                copied && styles.resultContentCopied,
            ]}
            activeOpacity={0.7}
        >
            {children}
        </TouchableOpacity>
    </View>
);

const styles = StyleSheet.create({
    resultContentCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
});
