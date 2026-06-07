import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { CustomText } from '../CustomText';
import { theme } from '../../styles/theme';

const LABEL_LEFT = theme.spacing.md;
const LABEL_GAP_PADDING = theme.spacing.sm;
const LABEL_LINE_HEIGHT = 18;
const LABEL_BORDER_CROSSING_Y = 9;

type FloatingInputLabelProps = {
    bottomBackgroundColor: string;
    color: string;
    label: string;
    topBackgroundColor: string;
};

export const FloatingInputLabel = ({
    bottomBackgroundColor,
    color,
    label,
    topBackgroundColor,
}: FloatingInputLabelProps) => {
    const [labelWidth, setLabelWidth] = useState(0);

    const handleLabelLayout = (event: LayoutChangeEvent) => {
        const nextWidth = Math.ceil(event.nativeEvent.layout.width);
        setLabelWidth(previousWidth => previousWidth === nextWidth ? previousWidth : nextWidth);
    };

    return (
        <>
            <View
                pointerEvents="none"
                style={[
                    styles.labelBackplate,
                    { width: labelWidth + LABEL_GAP_PADDING * 2 },
                ]}
            >
                <View
                    style={[
                        styles.labelBackplateTop,
                        { backgroundColor: topBackgroundColor },
                    ]}
                />
                <View
                    style={[
                        styles.labelBackplateBottom,
                        { backgroundColor: bottomBackgroundColor },
                    ]}
                />
            </View>
            <CustomText
                onLayout={handleLabelLayout}
                pointerEvents="none"
                style={[
                    styles.floatingLabel,
                    { color },
                ]}
                numberOfLines={1}
            >
                {label}
            </CustomText>
        </>
    );
};

const styles = StyleSheet.create({
    floatingLabel: {
        position: 'absolute',
        top: 0,
        left: LABEL_LEFT,
        zIndex: 6,
        elevation: 6,
        fontSize: theme.typography.caption.fontSize,
        lineHeight: LABEL_LINE_HEIGHT,
        fontWeight: '600',
    },
    labelBackplate: {
        position: 'absolute',
        top: 0,
        left: LABEL_LEFT - LABEL_GAP_PADDING,
        height: LABEL_LINE_HEIGHT,
        zIndex: 5,
        elevation: 5,
        overflow: 'hidden',
    },
    labelBackplateTop: {
        height: LABEL_BORDER_CROSSING_Y,
    },
    labelBackplateBottom: {
        height: LABEL_LINE_HEIGHT - LABEL_BORDER_CROSSING_Y,
    },
});
