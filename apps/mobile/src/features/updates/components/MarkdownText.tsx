import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../../styles/theme';
import { parseMarkdownBlocks, parseMarkdownInline, type MarkdownInline } from './markdown';

type MarkdownTextProps = {
    markdown: string;
};

const styles = StyleSheet.create({
    container: {
        gap: 8,
    },
    heading: {
        color: theme.colors.text,
        fontSize: 15,
        fontWeight: '800',
        lineHeight: 20,
        marginTop: 4,
    },
    subheading: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 19,
        marginTop: 4,
    },
    body: {
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
        flex: 1,
    },
    bold: {
        fontWeight: '700',
    },
    italic: {
        fontStyle: 'italic',
    },
    code: {
        fontFamily: 'monospace',
        color: theme.colors.secondary,
        fontSize: 13,
    },
    link: {
        color: theme.colors.primary,
        textDecorationLine: 'underline',
    },
    bulletRow: {
        flexDirection: 'row',
        gap: 8,
    },
    bulletMarker: {
        color: theme.colors.primary,
        fontSize: 14,
        lineHeight: 20,
    },
    codeBlock: {
        backgroundColor: theme.colors.surfaceElevated,
        borderRadius: theme.borderRadius.sm,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: 8,
    },
    codeBlockText: {
        color: theme.colors.textSecondary,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 17,
    },
    rule: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginVertical: 4,
    },
});

function renderInline(tokens: MarkdownInline[]): React.ReactNode {
    return tokens.map((token, index) => {
        switch (token.type) {
            case 'bold':
                return (
                    <Text key={index} style={styles.bold}>
                        {token.text}
                    </Text>
                );
            case 'italic':
                return (
                    <Text key={index} style={styles.italic}>
                        {token.text}
                    </Text>
                );
            case 'code':
                return (
                    <Text key={index} style={styles.code}>
                        {token.text}
                    </Text>
                );
            case 'link':
                return (
                    <Text
                        key={index}
                        style={styles.link}
                        onPress={() => Linking.openURL(token.url)}
                    >
                        {token.text}
                    </Text>
                );
            default:
                return <React.Fragment key={index}>{token.text}</React.Fragment>;
        }
    });
}

/**
 * Renders curated markdown (GitHub release bodies) with native nested Text
 * styling: headings, bullets, bold, italics, inline code, fenced code blocks,
 * rules and tappable links. Unrecognized markdown degrades to plain text.
 */
export function MarkdownText({ markdown }: MarkdownTextProps) {
    const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

    return (
        <View style={styles.container}>
            {blocks.map((block, index) => {
                switch (block.type) {
                    case 'heading':
                        return (
                            <Text
                                key={index}
                                style={block.level === 1 ? styles.heading : styles.subheading}
                            >
                                {block.text}
                            </Text>
                        );
                    case 'paragraph':
                        return (
                            <Text key={index} style={styles.body}>
                                {renderInline(parseMarkdownInline(block.text))}
                            </Text>
                        );
                    case 'bullet':
                        return (
                            <View key={index} style={styles.bulletRow}>
                                <Text style={styles.bulletMarker}>{block.marker}</Text>
                                <Text style={styles.body}>
                                    {renderInline(parseMarkdownInline(block.text))}
                                </Text>
                            </View>
                        );
                    case 'codeBlock':
                        return (
                            <View key={index} style={styles.codeBlock}>
                                <Text style={styles.codeBlockText}>
                                    {block.lines.join('\n')}
                                </Text>
                            </View>
                        );
                    case 'rule':
                        return <View key={index} style={styles.rule} />;
                    default:
                        return null;
                }
            })}
        </View>
    );
}
