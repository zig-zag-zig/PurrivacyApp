import Icon from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';

import { CustomText } from '../../components/CustomText';
import { DropdownSelect } from '../../components/DropdownSelect';
import { commonStyles } from '../../styles/commonStyles';
import { theme } from '../../styles/theme';
import { FormField } from './FormField';

type SelectValue = string | number;

type SelectFieldOption<T extends SelectValue> = {
    label: string;
    value: T;
};

type SelectFieldProps<T extends SelectValue> = {
    error?: string;
    label: string;
    onClose: () => void;
    onOpen: () => void;
    onSelect: (option: SelectFieldOption<T>, index: number) => void;
    options: ReadonlyArray<SelectFieldOption<T>>;
    value: T;
    visible: boolean;
};

export function SelectField<T extends SelectValue>({
    error,
    label,
    onClose,
    onOpen,
    onSelect,
    options,
    value,
    visible,
}: SelectFieldProps<T>) {
    const selectedLabel = options.find(option => option.value === value)?.label ?? 'Select';

    return (
        <FormField>
            <CustomText style={commonStyles.textLabel}>{label}</CustomText>
            <View style={styles.dropdownContainer}>
                <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => {
                        Keyboard.dismiss();
                        onOpen();
                    }}
                    activeOpacity={0.7}
                >
                    <CustomText
                        style={[
                            commonStyles.textBody,
                            commonStyles.flex,
                            {
                                color: selectedLabel ? theme.colors.text : theme.colors.placeholder,
                            },
                        ]}
                        ellipsizeMode="tail"
                    >
                        {selectedLabel}
                    </CustomText>
                    <Icon
                        name={visible ? 'expand-less' : 'expand-more'}
                        size={24}
                        color={theme.colors.textSecondary}
                    />
                </TouchableOpacity>
                <DropdownSelect
                    visible={visible}
                    options={options.map(option => option.label)}
                    onSelect={index => {
                        onSelect(options[index], index);
                    }}
                    onClose={onClose}
                />
            </View>
            {error ? (
                <CustomText style={styles.errorText}>
                    {error}
                </CustomText>
            ) : null}
        </FormField>
    );
}

const styles = StyleSheet.create({
    dropdownContainer: {
        position: 'relative',
        width: '100%',
        marginTop: theme.spacing.sm,
    },
    selectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        borderColor: theme.colors.divider,
        borderWidth: 2,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        paddingHorizontal: theme.spacing.md + 4,
        paddingVertical: theme.spacing.sm + 2,
        minHeight: 44,
    },
    errorText: {
        color: theme.colors.error,
        marginTop: 4,
        marginLeft: 4,
        fontSize: 13,
    },
});
