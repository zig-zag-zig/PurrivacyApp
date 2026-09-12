import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { CustomText } from '../../components/CustomText';
import { commonStyles } from '../../styles/commonStyles';
import { theme } from '../../styles/theme';

type CopyableResultBlockProps = {
    children: React.ReactNode;
    copied: boolean;
    copyTestID?: string;
    label: string;
    onCopy: () => void;
    /**
     * Optional outbound share. When provided, a share icon is rendered in the
     * header so the value can be handed to a trusted app rather than copied to
     * the clipboard.
     */
    onShare?: () => void;
    shareTestID?: string;
    shareAccessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
};

export const CopyableResultBlock = ({
    children,
    copied,
    copyTestID,
    label,
    onCopy,
    onShare,
    shareTestID,
    shareAccessibilityLabel,
    style,
    contentStyle,
}: CopyableResultBlockProps) => (
    <View style={[commonStyles.labeledResultBlock, style]}>
        <View style={styles.labelRow}>
            <CustomText style={[commonStyles.labeledResultLabel, styles.label]}>{label}</CustomText>
            {onShare ? (
                <TouchableOpacity
                    testID={shareTestID}
                    onPress={onShare}
                    accessibilityLabel={shareAccessibilityLabel ?? `Share ${label}`}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={styles.shareButton}
                >
                    <Icon name="share" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
            ) : null}
        </View>
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
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    label: {
        flex: 1,
    },
    shareButton: {
        paddingLeft: theme.spacing.sm,
    },
});
