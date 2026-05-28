import React, { useState, useMemo, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { CustomText } from '../../../components/CustomText';
import { getDisplayName } from '../domain/displayNameUtils';
import { KeyList } from './KeyList';
import { KeyPair } from '../../../types/types';
import { theme } from '../../../styles/theme';
import { sortKeysByPopularity, sortKeysAlphabetically } from '../domain/popularityStorage';
import { commonStyles } from '../../../styles/commonStyles';
import Icon from '@expo/vector-icons/MaterialIcons';
import { ModalToastHost } from '../../../components/ModalToastHost';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyMetadataPills } from './KeyMetadataPills';

interface KeySelectionModalProps {
    visible: boolean;
    onClose: () => void;
    keys: KeyPair[];
    displaySelectedKeys: { [fingerprint: string]: string };
    visualSelectedKeys: { [fingerprint: string]: string };
    onToggleKey: (key: KeyPair) => void;
    onLongPressKey?: (key: KeyPair) => void;
    popularityMap: Record<string, number>;
}

export const KeySelectionModal: React.FC<KeySelectionModalProps> = ({
    visible,
    onClose,
    keys,
    displaySelectedKeys,
    visualSelectedKeys,
    onToggleKey,
    onLongPressKey,
    popularityMap,
}) => {
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'popularity' | 'alphabetical'>('popularity');
    const [alphabeticalDirection, setAlphabeticalDirection] = useState<'asc' | 'desc'>('asc');
    const [popularitySnapshot, setPopularitySnapshot] = useState<Record<string, number> | null>(null);

    const resetAndClose = () => {
        onClose();
        setSearchQuery('');
        setSortBy('popularity');
        setAlphabeticalDirection('asc');
    };

    useEffect(() => {
        if (searchQuery.trim()) {
            setPopularitySnapshot({ ...popularityMap });
        } else {
            setPopularitySnapshot(null);
        }
    }, [searchQuery]);

    const handlePopularityPress = () => {
        setSortBy('popularity');
    };

    const handleAlphabeticalPress = () => {
        if (sortBy !== 'alphabetical') {
            setSortBy('alphabetical');
            setAlphabeticalDirection('asc');
        } else {
            setAlphabeticalDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        }
    };

    // Filter keys by search query (search in userId)
    const filteredKeys = useMemo(() => {
        if (!searchQuery.trim()) return keys;
        const query = searchQuery.toLowerCase();
        return keys.filter(key => key.userId.toLowerCase().includes(query));
    }, [keys, searchQuery]);

    // Determine sort order: if searching, sort by popularity only; otherwise use chosen sortBy
    const effectiveSortOrder = searchQuery.trim() ? 'popularity' : sortBy;

    // Sort all filtered keys (no separation of selected/unselected when searching)
    const sortedKeys = useMemo(() => {
        const currentPopularityMap = popularitySnapshot ?? popularityMap;
        if (searchQuery.trim()) {
            // When searching, sort by popularity only (as per effectiveSortOrder)
            if (effectiveSortOrder === 'popularity') {
                return sortKeysByPopularity(filteredKeys, currentPopularityMap);
            } else {
                return sortKeysAlphabetically(filteredKeys, alphabeticalDirection);
            }
        } else {
            // Separate selected and unselected, sort each group by chosen order
            const selectedKeysList = filteredKeys.filter(key => displaySelectedKeys[key.fingerprint]);
            const unselectedKeysList = filteredKeys.filter(key => !displaySelectedKeys[key.fingerprint]);

            const sortKeys = (keysToSort: KeyPair[]) => {
                if (effectiveSortOrder === 'popularity') {
                    return sortKeysByPopularity(keysToSort, currentPopularityMap);
                } else {
                    return sortKeysAlphabetically(keysToSort, alphabeticalDirection);
                }
            };

            const sortedSelected = sortKeys(selectedKeysList);
            const sortedUnselected = sortKeys(unselectedKeysList);

            return [...sortedSelected, ...sortedUnselected];
        }
    }, [filteredKeys, effectiveSortOrder, popularityMap, popularitySnapshot, alphabeticalDirection, searchQuery, displaySelectedKeys]);

    const displayKeys = sortedKeys;
    const popularityActive = sortBy === 'popularity';
    const alphabeticalActive = sortBy === 'alphabetical';
    const popularityColor = popularityActive ? theme.colors.onPrimary : theme.colors.textSecondary;
    const alphabeticalColor = alphabeticalActive ? theme.colors.onPrimary : theme.colors.textSecondary;
    const alphabeticalArrowIcon = alphabeticalDirection === 'asc' ? 'arrow-upward' : 'arrow-downward';

    const renderKeyDetails = (key: KeyPair) => (
        <View style={styles.detailsContainer}>
            <View style={styles.detailsHeader}>
                <CustomText style={styles.detailsTitle} numberOfLines={1}>
                    {getDisplayName(key.userId) || key.userId.trim() || 'Unnamed Key'}
                </CustomText>
                <View style={styles.detailsAction}>
                    {key.isDefault ? (
                        <View style={commonStyles.iconButton} accessibilityLabel="Default key">
                            <Icon name="star" size={24} color={theme.colors.primary} />
                        </View>
                    ) : null}
                </View>
            </View>
            <KeyMetadataPills
                keyPair={key}
                selected={Boolean(visualSelectedKeys[key.fingerprint])}
            />
        </View>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={resetAndClose}
        >
            <View style={styles.modalOverlay}>
                <View
                    style={[
                        styles.modalContent,
                        {
                            paddingTop: insets.top + theme.spacing.md,
                            paddingBottom: insets.bottom + theme.spacing.lg,
                        },
                    ]}
                >
                    <View style={styles.header}>
                        <View>
                            <CustomText style={styles.title}>All Keys</CustomText>
                            <CustomText style={styles.subtitle}>
                                {keys.length} {keys.length === 1 ? 'key' : 'keys'}
                            </CustomText>
                        </View>
                        <TouchableOpacity
                            onPress={resetAndClose}
                            style={styles.closeButton}
                            accessibilityLabel="Close all keys"
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                            <Icon name="close" size={22} color={theme.colors.text} />
                        </TouchableOpacity>
                    </View>

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
                            onChangeText={setSearchQuery}
                            placeholderTextColor={theme.colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {searchQuery.trim() !== '' && (
                            <TouchableOpacity
                                onPress={() => setSearchQuery('')}
                                style={styles.clearButton}
                                accessibilityLabel="Clear search"
                            >
                                <Icon name="close" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {!searchQuery.trim() && (
                        <View style={styles.sortContainer}>
                            <View style={styles.sortSegments}>
                                <TouchableOpacity
                                    style={[
                                        styles.sortPill,
                                        styles.sortPillPopular,
                                        popularityActive && styles.sortPillActive,
                                    ]}
                                    onPress={handlePopularityPress}
                                    accessibilityRole="button"
                                    accessibilityLabel="Sort by popularity"
                                >
                                    <Icon
                                        name="local-fire-department"
                                        size={17}
                                        color={popularityColor}
                                    />
                                    <CustomText
                                        style={[
                                            styles.sortPillText,
                                            popularityActive && styles.sortPillTextActive,
                                        ]}
                                        numberOfLines={1}
                                    >
                                        Popular
                                    </CustomText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.sortPill,
                                        styles.sortPillIcon,
                                        alphabeticalActive && styles.sortPillActive,
                                    ]}
                                    onPress={handleAlphabeticalPress}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Sort alphabetically ${alphabeticalDirection === 'asc' ? 'ascending' : 'descending'}`}
                                >
                                    <Icon
                                        name="sort-by-alpha"
                                        size={18}
                                        color={alphabeticalColor}
                                    />
                                    <Icon
                                        name={alphabeticalArrowIcon}
                                        size={14}
                                        color={alphabeticalColor}
                                        style={styles.sortDirectionIcon}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <ScrollView
                        style={styles.keyListContainer}
                        contentContainerStyle={styles.keyListContent}
                        keyboardShouldPersistTaps="always"
                    >
                        {displayKeys.length === 0 ? (
                            <View style={styles.noResultsContainer}>
                                <CustomText style={styles.noResultsText}>No keys found</CustomText>
                            </View>
                        ) : (
                            <KeyList
                                keys={displayKeys}
                                selectedKeys={[visualSelectedKeys]}
                                onToggleKey={onToggleKey}
                                onLongPressKey={onLongPressKey}
                                renderExtra={searchQuery.trim() ? renderKeyDetails : undefined}
                            />
                        )}
                    </ScrollView>
                </View>
            </View>
            <ModalToastHost />
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    modalContent: {
        flex: 1,
        backgroundColor: theme.colors.background,
        borderRadius: 0,
        width: '100%',
        height: '100%',
        paddingHorizontal: theme.spacing.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
    },
    title: {
        color: theme.colors.text,
        fontSize: 22,
        fontWeight: '700',
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        marginTop: 2,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.sm,
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
    sortContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
    },
    sortLabel: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    sortSegments: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: 3,
        borderRadius: 999,
        backgroundColor: `${theme.colors.surface}CC`,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    sortPill: {
        minHeight: 34,
        borderRadius: 999,
        borderWidth: 0,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: theme.spacing.xs,
    },
    sortPillPopular: {
        paddingHorizontal: theme.spacing.sm,
        minWidth: 96,
    },
    sortPillIcon: {
        width: 48,
        paddingHorizontal: theme.spacing.xs,
    },
    sortPillActive: {
        backgroundColor: theme.colors.primary,
    },
    sortPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    sortPillTextActive: {
        color: theme.colors.onPrimary,
        fontWeight: '600',
    },
    sortDirectionIcon: {
        marginLeft: -theme.spacing.xs,
    },
    keyListContainer: {
        flex: 1,
    },
    keyListContent: {
        paddingBottom: theme.spacing.lg,
    },
    detailsContainer: {
        gap: theme.spacing.sm,
        minWidth: 0,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
    },
    detailsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    detailsTitle: {
        ...commonStyles.textBody,
        flex: 1,
        minWidth: 0,
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 16,
    },
    detailsAction: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 40,
    },
    noResultsContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: theme.spacing.xl,
    },
    noResultsText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
});
