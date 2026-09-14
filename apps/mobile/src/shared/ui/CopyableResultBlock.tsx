import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
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
     * Colors for the label's notch backplate. The label straddles the content
     * border, so its top half must match whatever surface sits BEHIND the block
     * and its bottom half must match the content fill — a single background
     * makes the label look sunk into the field.
     */
    labelTopBackgroundColor?: string;
    labelBottomBackgroundColor?: string;
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

// Label geometry: the label's line box is 16px tall and straddles the content
// border, which sits at the block's paddingTop (spacing.sm = 8px).
const LABEL_LINE_HEIGHT = 16;
const LABEL_BORDER_CROSSING_Y = theme.spacing.sm;

export const CopyableResultBlock = ({
    children,
    copied,
    copyTestID,
    label,
    onCopy,
    labelTopBackgroundColor = theme.colors.surface,
    labelBottomBackgroundColor = theme.colors.surfaceMuted,
    onShare,
    shareTestID,
    shareAccessibilityLabel,
    style,
    contentStyle,
}: CopyableResultBlockProps) => {
    const [labelWidth, setLabelWidth] = useState(0);

    const handleLabelLayout = (event: LayoutChangeEvent) => {
        const nextWidth = Math.ceil(event.nativeEvent.layout.width);
        setLabelWidth(previousWidth => (previousWidth === nextWidth ? previousWidth : nextWidth));
    };

    return (
        <View style={[commonStyles.labeledResultBlock, style]}>
            {/* Two-tone backplate so the label notches cleanly through the
                content border: top half matches the surface behind the block,
                bottom half masks the border with the content fill. */}
            <View
                pointerEvents="none"
                style={[styles.labelBackplate, { width: labelWidth }]}
            >
                <View
                    style={[styles.labelBackplateTop, { backgroundColor: labelTopBackgroundColor }]}
                />
                <View
                    style={[styles.labelBackplateBottom, { backgroundColor: labelBottomBackgroundColor }]}
                />
            </View>
            <CustomText
                onLayout={handleLabelLayout}
                style={[commonStyles.labeledResultLabel, styles.label]}
            >
                {label}
            </CustomText>
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
};

const styles = StyleSheet.create({
    resultContentCopied: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
    },
    label: {
        backgroundColor: 'transparent',
        zIndex: 3,
    },
    labelBackplate: {
        position: 'absolute',
        // The label box already includes its own horizontal padding, so the
        // backplate matches that box exactly (same left, same measured width).
        top: 0,
        left: theme.spacing.md,
        height: LABEL_LINE_HEIGHT,
        zIndex: 2,
        overflow: 'hidden',
    },
    labelBackplateTop: {
        height: LABEL_BORDER_CROSSING_Y,
    },
    labelBackplateBottom: {
        height: LABEL_LINE_HEIGHT - LABEL_BORDER_CROSSING_Y,
    },
    shareButton: {
        position: 'absolute',
        top: 0,
        right: theme.spacing.md,
        zIndex: 4,
        paddingLeft: theme.spacing.sm,
    },
});
