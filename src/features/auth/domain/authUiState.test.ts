import { describe, expect, it } from 'vitest';

import { shouldShowUnlockScreen } from './authUiState';

const rememberedUser = {
    uid: 'user-id',
    username: 'purr-user',
};

describe('shouldShowUnlockScreen', () => {
    it('does not turn an in-progress sign-in into an unlock screen', () => {
        expect(shouldShowUnlockScreen(false, rememberedUser)).toBe(false);
    });

    it('shows unlock for an explicitly locked remembered session', () => {
        expect(shouldShowUnlockScreen(true, rememberedUser)).toBe(true);
    });

    it('does not show unlock without a remembered account', () => {
        expect(shouldShowUnlockScreen(true, null)).toBe(false);
    });
});
