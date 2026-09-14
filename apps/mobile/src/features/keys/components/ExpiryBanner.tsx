import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { CustomText } from '../../../components/CustomText';
import { theme } from '../../../styles/theme';

interface ExpiryBannerProps {
    expiringCount: number;
    expiredCount: number;
    onShowExpiring: () => void;
    onDismiss: () => void;
    testIDPrefix?: string;
}

/**
 * Top-of-vault warning shown when any key is expired or expiring soon. Tapping
 * "Review" applies the Expiring filter so the user can see which keys need
 * attention. Dismissal is session-scoped (re-arms on the next fresh sign-in).
 */
export const ExpiryBanner: React.FC<ExpiryBannerProps> = ({
    expiringCount,
    expiredCount,
    onShowExpiring,
    onDismiss,
    testIDPrefix,
}) => {
    if (expiringCount === 0 && expiredCount === 0) return null;

    const parts: string[] = [];
    if (expiredCount > 0) {
        parts.push(`${expiredCount} expired`);
    }
    if (expiringCount > 0) {
        parts.push(`${expiringCount} expiring soon`);
    }
    const summary = parts.join(', ');
    const title = `${expiredCount + expiringCount} ${expiredCount + expiringCount === 1 ? 'key needs' : 'keys need'} attention`;

    return (
        <View style={styles.banner} testID={testIDPrefix ? `${testIDPrefix}.banner` : undefined}>
            <Icon name="schedule" size={22} color={theme.colors.warning} style={styles.icon} />
            <View style={styles.textBlock}>
                <CustomText style={styles.title}>{title}</CustomText>
                <CustomText style={styles.summary}>{summary}</CustomText>
            </View>
            <View style={styles.actions}>
                <TouchableOpacity
                    onPress={onShowExpiring}
                    accessibilityLabel="Review expiring keys"
                    accessibilityRole="button"
                    testID={testIDPrefix ? `${testIDPrefix}.review` : undefined}
                >
                    <CustomText style={styles.review}>Review</CustomText>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onDismiss}
                    accessibilityLabel="Dismiss expiry warning"
                    accessibilityRole="button"
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    testID={testIDPrefix ? `${testIDPrefix}.dismiss` : undefined}
                >
                    <Icon name="close" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        backgroundColor: `${theme.colors.warning}14`,
        borderWidth: 1,
        borderColor: `${theme.colors.warning}55`,
        borderRadius: theme.borderRadius.lg,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    icon: {
        flexShrink: 0,
    },
    textBlock: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: theme.colors.text,
        fontWeight: '700',
        fontSize: 14,
    },
    summary: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
    },
    review: {
        color: theme.colors.warning,
        fontWeight: '700',
        fontSize: 14,
    },
});
