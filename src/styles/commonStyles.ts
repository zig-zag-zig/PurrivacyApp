import { StyleSheet } from 'react-native';
import { theme } from './theme';

export const commonStyles = StyleSheet.create({
    // Layout
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingHorizontal: theme.spacing.md,
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
        padding: theme.spacing.md,
    },

    // Surfaces
    surface: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        ...theme.elevation.low,
    },

    // Typography (fixed font weights)
    textTitle: {
        ...theme.typography.title,
        color: theme.colors.text,
        fontWeight: '600' as const,
    },
    textBody: {
        ...theme.typography.body,
        color: theme.colors.text,
        fontWeight: '400' as const,
    },
    textLabel: {
        ...theme.typography.label,
        color: theme.colors.textSecondary,
        fontWeight: '500' as const,
    },
    textCaption: {
        ...theme.typography.caption,
        color: theme.colors.textSecondary,
        fontWeight: '400' as const,
    },

    // Components
    input: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        color: theme.colors.text,
        fontSize: theme.typography.body.fontSize,
        minHeight: 44,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginBottom: theme.spacing.sm,
        shadowColor: theme.colors.background,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
    },

    buttonIcon: {
        padding: theme.spacing.xs,
        borderRadius: 999,
        backgroundColor: 'transparent',
        marginLeft: theme.spacing.sm,
    },

    navItem: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: theme.spacing.xs,
        alignSelf: 'stretch',
        width: '100%',
        minWidth: 0,
        overflow: 'visible',
    },
    navItemActive: {
        backgroundColor: theme.colors.primary,
        ...theme.elevation.high,
    },
    navItemInactive: {
        backgroundColor: 'transparent',
    },

    // Result containers (for EncryptedResult, DecryptionResult)
    resultContainer: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginTop: theme.spacing.md,
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
        paddingHorizontal: theme.spacing.xs,
        backgroundColor: theme.colors.surface,
        color: theme.colors.primary,
        fontSize: theme.typography.caption.fontSize,
        lineHeight: 16,
        fontWeight: '600' as const,
    },
    resultContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.sm,
        padding: theme.spacing.md,
        minHeight: 150,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },

    // Monospace text for PGP keys
    monospaceText: {
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 16,
    },

    signatureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: theme.spacing.sm,
        marginLeft: theme.spacing.md,
    },

    // Modal overlays
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },

    // Modal button containers
    modalCancelText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        fontSize: 18,
        textAlign: 'center',
    },
    modalCancelButton: {
        marginTop: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        alignItems: 'center',
        borderRadius: theme.borderRadius.sm,
        backgroundColor: theme.colors.surface,
    },

    // Icon button
    iconButton: {
        padding: theme.spacing.sm,
    },

    // Button styles (used by Button component which is used everywhere)
    button: {
        borderRadius: theme.borderRadius.md,
        paddingVertical: 11,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        marginVertical: theme.spacing.xs,
        minHeight: 46,
        shadowColor: theme.colors.background,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
    },
    buttonPrimary: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.borderRadius.md,
        paddingVertical: 11,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        ...theme.elevation.high,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
    },
    buttonSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.md,
        paddingVertical: 11,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
    },
    disabled: {
        opacity: 0.6,
    },

    // Navigation styles (used by KeyScreen navigation)
    navContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.md,
        ...theme.elevation.low,
        zIndex: 999999,
    },
});
