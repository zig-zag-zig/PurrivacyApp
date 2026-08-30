import { describe, expect, it, vi } from 'vitest';

// The hook file imports consumePendingSignup from autofillCommit, whose real
// module pulls in react-native (NativeModules), which cannot run in Node.
vi.mock('../../../../native/autofillCommit', () => ({ consumePendingSignup: vi.fn() }));

import { resumePendingSignupAfterRestart } from './usePendingSignupResume';
import type { PendingSignupPayload } from '../../../../native/autofillCommit';

const payload: PendingSignupPayload = {
    seed: 'seed words here',
    username: 'alice',
    password: 'hunter2!',
};

describe('resumePendingSignupAfterRestart (APP-SEC-007)', () => {
    it('stores the consumed secrets and navigates to seed verification', async () => {
        const setSession = vi.fn();
        const navigate = vi.fn();

        await resumePendingSignupAfterRestart({
            consume: async () => payload,
            setSession,
            navigate,
        });

        expect(setSession).toHaveBeenCalledWith(payload);
        expect(navigate).toHaveBeenCalledWith('SignupSeedVerification');
    });

    it('does nothing when there is no pending signup', async () => {
        const setSession = vi.fn();
        const navigate = vi.fn();

        await resumePendingSignupAfterRestart({
            consume: async () => null,
            setSession,
            navigate,
        });

        expect(setSession).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});
