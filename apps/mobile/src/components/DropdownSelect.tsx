import React from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Keyboard } from 'react-native';
import { CustomText } from './CustomText';
import { theme } from '../styles/theme';

type DropdownSelectProps = {
    visible: boolean;
    options: string[];
    onSelect: (idx: number) => void;
    onClose?: () => void;
    destructiveIndex?: number;
    selectedIndex?: number;
    integrated?: boolean;
    style?: any;
};

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
    visible,
    options,
    onSelect,
    onClose,
    destructiveIndex,
    selectedIndex,
    integrated = false,
    style,
}) => {
    if (!visible) return null;

    const dropdownStyle = {
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.dividerStrong,
        ...theme.elevation.high,
        position: 'absolute' as const,
        zIndex: 9999,
        width: '100%',
        maxHeight: 300,
        top: '100%',
        borderBottomLeftRadius: theme.borderRadius.md,
        borderBottomRightRadius: theme.borderRadius.md,
        borderTopLeftRadius: integrated ? 0 : theme.borderRadius.md,
        borderTopRightRadius: integrated ? 0 : theme.borderRadius.md,
        marginTop: integrated ? -1 : theme.spacing.xs,
        overflow: 'hidden' as const,
    };

    return (
        <View style={[dropdownStyle, style]}>
            <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                {options.map((option, idx) => (
                    <TouchableOpacity
                        key={idx}
                        onPress={() => {
                            Keyboard.dismiss();
                            onSelect(idx);
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                        style={[
                            styles.option,
                            idx === selectedIndex && styles.selectedOption,
                            idx === destructiveIndex && styles.destructiveOption,
                        ]}
                    >
                        <CustomText
                            style={[
                                styles.optionText,
                                idx === selectedIndex && styles.selectedText,
                                idx === destructiveIndex && styles.destructiveText,
                            ]}
                        >
                            {option}
                        </CustomText>
                        {idx === selectedIndex ? (
                            <View style={styles.selectedIndicator} />
                        ) : null}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    optionsContainer: {
        maxHeight: 250,
    },
    option: {
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    optionText: {
        fontSize: 16,
        color: theme.colors.text,
    },
    selectedOption: {
        backgroundColor: theme.colors.primaryMuted,
    },
    selectedText: {
        color: theme.colors.primaryStrong,
        fontWeight: '700',
    },
    selectedIndicator: {
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: theme.colors.secondary,
        marginLeft: theme.spacing.md,
    },
    destructiveOption: {
        backgroundColor: theme.colors.error + '22',
    },
    destructiveText: {
        color: theme.colors.error,
        fontWeight: 'bold',
    },
});
