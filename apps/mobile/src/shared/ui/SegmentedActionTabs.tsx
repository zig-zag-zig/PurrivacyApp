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
                const tintColor = active ? theme.colors.primaryStrong : theme.colors.textMuted;

                return (
                    <TouchableOpacity
                        testID={testIDPrefix ? `${testIDPrefix}.${tab.action}` : undefined}
                        key={tab.action}
                        style={[styles.segment, active && styles.segmentActive]}
                        onPress={() => onChange(tab.action)}
                        activeOpacity={0.78}
                    >
                        <View style={[styles.iconFrame, active && styles.iconFrameActive]}>
                            <Icon name={tab.icon} size={19} color={tintColor} />
                        </View>
                        <CustomText
                            style={[styles.segmentText, active && styles.segmentTextActive]}
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
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.xs,
        gap: theme.spacing.xs,
    },
    segment: {
        flex: 1,
        minHeight: 54,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        gap: 3,
        borderRadius: theme.borderRadius.md,
    },
    segmentActive: {
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.dividerStrong,
        ...theme.elevation.low,
    },
    iconFrame: {
        width: 30,
        height: 24,
        borderRadius: theme.borderRadius.pill,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconFrameActive: {
        backgroundColor: theme.colors.primaryMuted,
    },
    segmentText: {
        color: theme.colors.textMuted,
        fontSize: 12,
        lineHeight: 15,
        fontWeight: '700',
        flexShrink: 1,
    },
    segmentTextActive: {
        color: theme.colors.text,
    },
});
