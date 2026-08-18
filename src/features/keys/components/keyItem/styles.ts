import { StyleSheet } from 'react-native';

import { commonStyles } from '../../../../styles/commonStyles';
import { theme } from '../../../../styles/theme';

/**
 * Shared presentation styles for the KeyItem module (APP-ARCH-002).
 * Moved verbatim from KeyItem.tsx; no style values changed.
 */
export const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        ...theme.elevation.low
    },
    cardExpanded: {
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    summaryPressable: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
    },
    summaryPressableExpanded: {
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    summary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
    },
    summaryMain: {
        flex: 1,
        minWidth: 0,
        gap: theme.spacing.sm,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    keyTitle: {
        ...commonStyles.textBody,
        flex: 1,
        color: theme.colors.text,
        fontWeight: '700',
    },
    actionColumn: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
    },
    details: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        gap: theme.spacing.xl,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.lg,
    },
    publicKeySection: {
        gap: theme.spacing.md,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        ...commonStyles.textBody,
        color: theme.colors.text,
        fontWeight: '700',
    },
    tempLabel: {
        alignSelf: 'flex-start',
        color: theme.colors.primary,
        borderColor: theme.colors.primary,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
        marginTop: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 15,
    },
});
