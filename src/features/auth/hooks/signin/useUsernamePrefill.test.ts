import { describe, expect, it } from 'vitest';
import { getUsernamePrefill } from './useUsernamePrefill';
import type { LastSignedInUser } from '../../../../types/types';

const lastSignedInUser: LastSignedInUser = {
    uid: 'uid-1',
    username: 'alice',
};

describe('getUsernamePrefill (APP-ARCH-002)', () => {
    it('returns the last signed-in username when focused', () => {
        expect(getUsernamePrefill(true, lastSignedInUser)).toBe('alice');
    });

    it('returns null when the screen is not focused', () => {
        expect(getUsernamePrefill(false, lastSignedInUser)).toBeNull();
    });

    it('returns null when there is no last signed-in user', () => {
        expect(getUsernamePrefill(true, null)).toBeNull();
    });

    it('returns null when the last signed-in user has no username', () => {
        expect(getUsernamePrefill(true, { uid: 'uid-2', username: '' })).toBeNull();
    });
});
