import type { KeySelectionMap } from '../model/keySelectionTypes';

export function getFirstSelectedKeyId(keys: KeySelectionMap): string | null {
    return Object.keys(keys)[0] ?? null;
}

export function hasSelectedKeys(keys: KeySelectionMap): boolean {
    return Object.keys(keys).length > 0;
}
