import { useEffect, useMemo, useState } from 'react';

import { theme } from '../../../../styles/theme';
import type { KeyPair } from '../../../../types/types';
import { sortKeysAlphabetically, sortKeysByPopularity } from '../../domain/popularityStorage';

type UseKeySelectionListParams = {
    keys: KeyPair[];
    displaySelectedKeys: { [fingerprint: string]: string };
    popularityMap: Record<string, number>;
};

type UseKeySelectionListResult = {
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    displayKeys: KeyPair[];
    popularityActive: boolean;
    alphabeticalActive: boolean;
    popularityColor: string;
    alphabeticalColor: string;
    alphabeticalDirection: 'asc' | 'desc';
    alphabeticalArrowIcon: 'arrow-upward' | 'arrow-downward';
    handlePopularityPress: () => void;
    handleAlphabeticalPress: () => void;
    resetListState: () => void;
};

/**
 * Extracted from KeySelectionModal (APP-ARCH-002) — owns the search/sort
 * selection state and the derived key-list ordering (filtering, popularity
 * snapshot while searching, selected-first grouping). The modal keeps only
 * chrome: header, search bar, sort pills, scroll view and close handling.
 */
export function useKeySelectionList({
    keys,
    displaySelectedKeys,
    popularityMap,
}: UseKeySelectionListParams): UseKeySelectionListResult {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'popularity' | 'alphabetical'>('popularity');
    const [alphabeticalDirection, setAlphabeticalDirection] = useState<'asc' | 'desc'>('asc');
    const [popularitySnapshot, setPopularitySnapshot] = useState<Record<string, number> | null>(null);

    // Snapshot popularity at the moment a search starts and restore live
    // values when the query is cleared. popularityMap is intentionally NOT a
    // dependency: mid-search popularity updates must not reorder results
    // (matches the original modal behaviour verbatim).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const query = searchQuery.trim().toLowerCase();
        return keys.filter(key => key.userId.toLowerCase().includes(query));
    }, [keys, searchQuery]);

    // Determine sort order: if searching, sort by popularity only; otherwise use chosen sortBy
    const effectiveSortOrder = searchQuery.trim() ? 'popularity' : sortBy;

    // Sort all filtered keys (no separation of selected/unselected when searching)
    const displayKeys = useMemo(() => {
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

    const popularityActive = sortBy === 'popularity';
    const alphabeticalActive = sortBy === 'alphabetical';
    const popularityColor = popularityActive ? theme.colors.onPrimary : theme.colors.textSecondary;
    const alphabeticalColor = alphabeticalActive ? theme.colors.onPrimary : theme.colors.textSecondary;
    const alphabeticalArrowIcon = alphabeticalDirection === 'asc' ? 'arrow-upward' : 'arrow-downward';

    const resetListState = () => {
        setSearchQuery('');
        setSortBy('popularity');
        setAlphabeticalDirection('asc');
    };

    return {
        searchQuery,
        setSearchQuery,
        displayKeys,
        popularityActive,
        alphabeticalActive,
        popularityColor,
        alphabeticalColor,
        alphabeticalDirection,
        alphabeticalArrowIcon,
        handlePopularityPress,
        handleAlphabeticalPress,
        resetListState,
    };
}
