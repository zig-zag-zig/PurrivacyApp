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
    style?: any;
};

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
    visible,
    options,
    onSelect,
    onClose,
    destructiveIndex,
    style,
}) => {
    if (!visible) return null;

    const dropdownStyle = {
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderTopWidth: 0,
        borderColor: theme.colors.divider,
        ...theme.elevation.high,
        position: 'absolute' as const,
        zIndex: 9999,
        width: '100%',
        maxHeight: 300,
        top: '100%',
        borderBottomLeftRadius: theme.borderRadius.md,
        borderBottomRightRadius: theme.borderRadius.md,
        borderTopLeftRadius: theme.borderRadius.md,
        borderTopRightRadius: theme.borderRadius.md,
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
                            idx === destructiveIndex && styles.destructiveOption,
                        ]}
                    >
                        <CustomText
                            style={[
                                styles.optionText,
                                idx === destructiveIndex && styles.destructiveText,
                            ]}
                        >
                            {option}
                        </CustomText>
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
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionText: {
        fontSize: 16,
        color: theme.colors.text,
    },
    destructiveOption: {
        backgroundColor: theme.colors.error + '22',
    },
    destructiveText: {
        color: theme.colors.error,
        fontWeight: 'bold',
    },
});
