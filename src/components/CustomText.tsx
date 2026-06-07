import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { theme } from '../styles/theme';

type TextVariant = 'title' | 'body' | 'label' | 'caption';
type FontWeight =
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900';

interface CustomTextProps extends RNTextProps {
    variant?: TextVariant;
    bold?: boolean;
    semiBold?: boolean;
    center?: boolean;
    right?: boolean;
    color?: keyof typeof theme.colors;
    contextMenuHidden?: boolean;
}

export const CustomText: React.FC<CustomTextProps> = ({
    variant = 'body',
    bold = false,
    semiBold = false,
    center = false,
    right = false,
    color = 'text',
    style,
    children,
    ...props
}) => {
    const textStyle = [
        styles.base,
        styles[variant],
        bold && styles.bold,
        semiBold && styles.semiBold,
        center && styles.center,
        right && styles.right,
        { color: theme.colors[color] },
        style,
    ];

    return (
        <RNText style={textStyle} {...props}>
            {children}
        </RNText>
    );
};

const styles = StyleSheet.create({
    base: {
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    title: {
        fontSize: theme.typography.title.fontSize,
        fontWeight: '600' as FontWeight,
        lineHeight: theme.typography.title.fontSize * 1.3,
    },
    body: {
        fontSize: theme.typography.body.fontSize,
        fontWeight: '400' as FontWeight,
        lineHeight: theme.typography.body.fontSize * 1.5,
    },
    label: {
        fontSize: theme.typography.label.fontSize,
        fontWeight: '500' as FontWeight,
        lineHeight: theme.typography.label.fontSize * 1.3,
    },
    caption: {
        fontSize: theme.typography.caption.fontSize,
        fontWeight: '400' as FontWeight,
        lineHeight: theme.typography.caption.fontSize * 1.3,
    },
    bold: {
        fontWeight: '700' as FontWeight,
    },
    semiBold: {
        fontWeight: '600' as FontWeight,
    },
    center: {
        textAlign: 'center',
    },
    right: {
        textAlign: 'right',
    },
});