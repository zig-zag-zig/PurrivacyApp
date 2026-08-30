import { StyleSheet } from 'react-native';
import { theme } from './theme';

export const commonStyles = StyleSheet.create({
    // Layout
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spaceBetween: {
        justifyContent: 'space-between',
    },
    flex: {
        flex: 1,
    },

    // Spacing
    p: {
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
    },

    // Surfaces
    surface: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.md,
        ...theme.elevation.low,
    },

    // Typography
    textTitle: {
        fontSize: theme.typography.title.fontSize,
        lineHeight: theme.typography.title.lineHeight,
        color: theme.colors.text,
        fontWeight: '700' as const,
        letterSpacing: -0.35,
    },
    textBody: {
        fontSize: theme.typography.body.fontSize,
        lineHeight: theme.typography.body.lineHeight,
        color: theme.colors.text,
        fontWeight: '400' as const,
    },
    textLabel: {
        fontSize: theme.typography.label.fontSize,
        lineHeight: theme.typography.label.lineHeight,
        color: theme.colors.textSecondary,
        fontWeight: '600' as const,
    },
    textCaption: {
        fontSize: theme.typography.caption.fontSize,
        lineHeight: theme.typography.caption.lineHeight,
        color: theme.colors.textSecondary,
        fontWeight: '400' as const,
    },

    // Legacy input style retained for direct consumers.
    input: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        color: theme.colors.text,
        fontSize: theme.typography.body.fontSize,
        minHeight: 52,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginBottom: theme.spacing.sm,
    },

    buttonIcon: {
        width: 38,
        height: 38,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: theme.spacing.sm,
    },

    navItem: {
        flex: 1,
        minHeight: 46,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: theme.spacing.xs,
        minWidth: 0,
    },
    navItemActive: {
        backgroundColor: theme.colors.primary,
        ...theme.elevation.glow,
    },
    navItemInactive: {
        backgroundColor: 'transparent',
    },

    // Result containers
    resultContainer: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.md,
        marginTop: theme.spacing.sm,
        ...theme.elevation.low,
    },
    labeledResultBlock: {
        position: 'relative',
        paddingTop: theme.spacing.sm,
    },
    labeledResultLabel: {
        position: 'absolute',
        top: 0,
        left: theme.spacing.md,
        zIndex: 2,
        paddingHorizontal: theme.spacing.sm,
        backgroundColor: theme.colors.surface,
        color: theme.colors.primaryStrong,
        fontSize: theme.typography.caption.fontSize,
        lineHeight: 16,
        fontWeight: '700' as const,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    resultContent: {
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        minHeight: 150,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },

    monospaceText: {
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.textSecondary,
    },

    signatureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
    },

    // Modal overlays
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
    },
    modalCancelText: {
        color: theme.colors.textSecondary,
        fontWeight: '700',
        fontSize: 16,
        textAlign: 'center',
    },
    modalCancelButton: {
        marginTop: theme.spacing.md,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },

    iconButton: {
        width: 40,
        height: 40,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Buttons
    button: {
        borderRadius: theme.borderRadius.md,
        paddingVertical: 13,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        marginVertical: theme.spacing.xs,
        minHeight: 52,
    },
    buttonPrimary: {
        backgroundColor: theme.colors.primary,
        borderWidth: 1,
        borderColor: theme.colors.primaryStrong,
        ...theme.elevation.glow,
    },
    buttonSecondary: {
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.dividerStrong,
    },
    disabled: {
        opacity: 0.46,
    },

    navContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginBottom: theme.spacing.md,
        padding: theme.spacing.xs,
        ...theme.elevation.low,
        zIndex: 999999,
    },
});
