import { describe, expect, it } from 'vitest';

import { isNoteProtected } from './noteTypes';

describe('isNoteProtected', () => {
    it('treats only an explicit true as protected', () => {
        expect(isNoteProtected({ requireReauth: true })).toBe(true);
        expect(isNoteProtected({ requireReauth: false })).toBe(false);
        expect(isNoteProtected({})).toBe(false);
    });
});