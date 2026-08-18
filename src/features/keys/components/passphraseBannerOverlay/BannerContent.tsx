import Icon from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CustomText } from '../../../../components/CustomText';
import { theme } from '../../../../styles/theme';
import { COMPACT_BANNER_HEIGHT, GENERATOR_BANNER_HEIGHT } from './constants';

type StoredBannerContentProps = {
    onUse: () => void;
};

/**
 * Dumb visual component (APP-ARCH-002) — the "Autofill passphrase" banner body.
 * Moved verbatim from PassphraseBannerOverlay.tsx; no style/testID/label changes.
 */
export const StoredBannerContent: React.FC<StoredBannerContentProps> = ({ onUse }) => (
    <Pressable
        onPress={onUse}
        style={styles.autofillContent}
        accessibilityRole="button"
        accessibilityLabel="Autofill passphrase"
    >
        <View style={styles.autofillIcon}>
            <Icon name="vpn-key" size={18} color={theme.colors.text} />
        </View>
        <CustomText style={styles.autofillText} numberOfLines={1}>
            Autofill passphrase
        </CustomText>
    </Pressable>
);

type GeneratedBannerContentProps = {
    generatedPassphrase?: string;
    onCopy?: () => void;
    onOpenSettings?: () => void;
    onUse: () => void;
    testID?: string;
};

/**
 * Dumb visual component (APP-ARCH-002) — the "Generated passphrase" banner body.
 * Moved verbatim from PassphraseBannerOverlay.tsx; no style/testID/label changes.
 */
export const GeneratedBannerContent: React.FC<GeneratedBannerContentProps> = ({
    generatedPassphrase,
    onCopy,
    onOpenSettings,
    onUse,
    testID,
}) => (
    <Pressable
        testID={testID ? `${testID}.generated.use` : undefined}
        onPress={onUse}
        style={styles.generatorContent}
        accessibilityRole="button"
        accessibilityLabel="Use generated passphrase"
    >
        <View style={styles.generatedTextColumn}>
            <CustomText style={styles.generatorTitle} numberOfLines={1}>
                Generated passphrase
            </CustomText>
            <CustomText
                testID={testID ? `${testID}.generated.text` : undefined}
                style={styles.generatedPassphrase}
                numberOfLines={1}
                ellipsizeMode="tail"
            >
                {generatedPassphrase || 'Generating...'}
            </CustomText>
        </View>

        <View style={styles.generatorActions}>
            <Pressable
                testID={testID ? `${testID}.generated.settings` : undefined}
                onPress={(event) => {
                    event.stopPropagation();
                    onOpenSettings?.();
                }}
                style={styles.bannerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Generated passphrase settings"
                hitSlop={8}
            >
                <Icon name="edit" size={18} color={theme.colors.primary} />
            </Pressable>
            <Pressable
                testID={testID ? `${testID}.generated.copy` : undefined}
                onPress={(event) => {
                    event.stopPropagation();
                    onCopy?.();
                }}
                style={styles.bannerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Copy generated passphrase"
                hitSlop={8}
            >
                <Icon name="content-copy" size={18} color={theme.colors.primary} />
            </Pressable>
        </View>
    </Pressable>
);

const styles = StyleSheet.create({
    autofillContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: COMPACT_BANNER_HEIGHT,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    autofillIcon: {
        alignItems: 'center',
        backgroundColor: 'rgba(18, 18, 18, 0.32)',
        borderRadius: 999,
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
    autofillText: {
        color: theme.colors.text,
        flex: 1,
        fontSize: theme.typography.body.fontSize,
        fontWeight: '700',
        lineHeight: 20,
    },
    generatorContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: GENERATOR_BANNER_HEIGHT,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    generatedTextColumn: {
        flex: 1,
        minWidth: 0,
    },
    generatorTitle: {
        color: theme.colors.primary,
        fontSize: theme.typography.caption.fontSize,
        fontWeight: '700',
        lineHeight: 16,
    },
    generatedPassphrase: {
        color: theme.colors.text,
        fontSize: theme.typography.label.fontSize,
        lineHeight: 18,
        marginTop: 2,
    },
    generatorActions: {
        flexDirection: 'row',
        flexShrink: 0,
        gap: theme.spacing.xs,
        justifyContent: 'flex-end',
    },
    bannerIconButton: {
        alignItems: 'center',
        borderRadius: 999,
        height: 34,
        justifyContent: 'center',
        width: 34,
    },
});
