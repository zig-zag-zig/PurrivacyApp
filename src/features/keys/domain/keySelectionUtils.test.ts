import { describe, expect, it } from 'vitest';

import { getFirstSelectedKeyId, hasSelectedKeys } from './keySelectionUtils';

describe('getFirstSelectedKeyId', () => {
    it('returns first key id from non-empty map', () => {
        expect(getFirstSelectedKeyId({ fp1: 'key1' })).toBe('fp1');
    });

    it('returns first key when multiple present', () => {
        const keys = { fp1: 'key1', fp2: 'key2' };
        expect(getFirstSelectedKeyId(keys)).toBe('fp1');
    });

    it('returns null for empty map', () => {
        expect(getFirstSelectedKeyId({})).toBeNull();
    });
});

describe('hasSelectedKeys', () => {
    it('returns true for non-empty map', () => {
        expect(hasSelectedKeys({ fp1: 'key1' })).toBe(true);
    });

    it('returns false for empty map', () => {
        expect(hasSelectedKeys({})).toBe(false);
    });
});
