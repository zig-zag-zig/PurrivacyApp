import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { CustomText } from '../../../components/CustomText';
import { theme } from '../../../styles/theme';
import { VAULT_KEY_FILTERS } from '../domain/keyFilters';
import type { VaultKeyFilter } from '../domain/keyFilters';

interface VaultFilterBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    activeFilter: VaultKeyFilter;
    onFilterChange: (filter: VaultKeyFilter) => void;
    testIDPrefix?: string;
}

/**
 * Search + kind-filter bar for the Keys tab. Sits inside the virtualized list
 * header. Mirrors the picker's search styling so the two surfaces read as the
 * same control.
 */
export const VaultFilterBar: React.FC<VaultFilterBarProps> = ({
    searchQuery,
    onSearchChange,
    activeFilter,
    onFilterChange,
    testIDPrefix,
}) => (
    <View style={styles.container}>
        <View style={styles.searchContainer}>
            <Icon name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
            <TextInput
                autoComplete="off"
                cursorColor={theme.colors.primary}
                importantForAutofill="noExcludeDescendants"
                selectionColor={theme.colors.primary}
                selectionHandleColor={theme.colors.primary}
                underlineColorAndroid="transparent"
                style={styles.searchInput}
                placeholder="Search keys"
                value={searchQuery}
                onChangeText={onSearchChange}
                onBlur={() => onSearchChange(searchQuery.trim())}
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                testID={testIDPrefix ? `${testIDPrefix}.search` : undefined}
                accessibilityLabel="Search keys"
            />
            {searchQuery.trim() !== '' && (
                <TouchableOpacity
                    onPress={() => onSearchChange('')}
                    style={styles.clearButton}
                    accessibilityLabel="Clear search"
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    testID={testIDPrefix ? `${testIDPrefix}.clear` : undefined}
                >
                    <Icon name="close" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
            )}
        </View>

        <View style={styles.chipsRow}>
            {VAULT_KEY_FILTERS.map(filter => {
                const active = filter.id === activeFilter;
                return (
                    <TouchableOpacity
                        key={filter.id}
                        onPress={() => onFilterChange(filter.id)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        testID={testIDPrefix ? `${testIDPrefix}.filter.${filter.id}` : undefined}
                    >
                        <CustomText style={[styles.chipText, active && styles.chipTextActive]}>
                            {filter.label}
                        </CustomText>
                    </TouchableOpacity>
                );
            })}
        </View>
    </View>
);

const styles = StyleSheet.create({
    container: {
        gap: theme.spacing.sm,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.lg,
        minHeight: 48,
    },
    searchIcon: {
        marginLeft: theme.spacing.md,
    },
    searchInput: {
        flex: 1,
        backgroundColor: 'transparent',
        borderWidth: 0,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        paddingRight: 40,
        color: theme.colors.text,
        fontSize: 16,
        includeFontPadding: false,
    },
    clearButton: {
        position: 'absolute',
        right: theme.spacing.sm,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.sm,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
    },
    chip: {
        minHeight: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipActive: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    chipTextActive: {
        color: theme.colors.primaryStrong,
    },
});
