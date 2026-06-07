import Icon from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import type { ComponentProps } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { CustomText } from '../../components/CustomText';
import { theme } from '../../styles/theme';

type MaterialIconName = ComponentProps<typeof Icon>['name'];

export type SegmentedActionTab<T extends string> = {
    action: T;
    icon: MaterialIconName;
    label: string;
};

type SegmentedActionTabsProps<T extends string> = {
    onChange: (action: T) => void;
    testIDPrefix?: string;
    tabs: Array<SegmentedActionTab<T>>;
    value: T;
};

export function SegmentedActionTabs<T extends string>({
    onChange,
    testIDPrefix,
    tabs,
    value,
}: SegmentedActionTabsProps<T>) {
    return (
        <View style={styles.segmentedControl}>
            {tabs.map(tab => {
                const active = value === tab.action;
                const tintColor = active ? theme.colors.onPrimary : theme.colors.textSecondary;

                return (
                    <TouchableOpacity
                        testID={testIDPrefix ? `${testIDPrefix}.${tab.action}` : undefined}
                        key={tab.action}
                        style={[
                            styles.segment,
                            active && styles.segmentActive,
                        ]}
                        onPress={() => onChange(tab.action)}
                        activeOpacity={0.78}
                    >
                        <Icon name={tab.icon} size={19} color={tintColor} />
                        <CustomText
                            style={[
                                styles.segmentText,
                                active && styles.segmentTextActive,
                            ]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.1}
                        >
                            {tab.label}
                        </CustomText>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
    },
    segment: {
        flex: 1,
        minHeight: 48,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.xs,
    },
    segmentActive: {
        backgroundColor: theme.colors.primary,
    },
    segmentText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '600',
        flexShrink: 1,
    },
    segmentTextActive: {
        color: theme.colors.onPrimary,
        fontWeight: '700',
    },
});
