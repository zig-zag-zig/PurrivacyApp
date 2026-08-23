import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import React from 'react';

import {
    getUsernamePrefill,
    useUsernamePrefill,
} from './useUsernamePrefill';

describe('useUsernamePrefill', () => {
    it('prefills the username when a last signed-in user exists', () => {
        let username = '';
        const Harness = () => {
            useUsernamePrefill(
                true,
                { uid: 'u1', username: 'alice' },
                (value) => { username = value; },
                { current: false },
            );
            return null;
        };
        act(() => {
            create(<Harness />);
        });
        expect(username).toBe('alice');
    });

    it('clears the prefilled username when the remembered user disappears', () => {
        let username = 'alice';
        let lastSignedIn: { uid: string; username: string | null } | null = { uid: 'u1', username: 'alice' };
        const handledRef = { current: false };
        const Harness = () => {
            useUsernamePrefill(
                true,
                lastSignedIn,
                (value) => { username = value; },
                handledRef,
            );
            return null;
        };
        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<Harness />);
        });
        expect(username).toBe('alice');
        expect(handledRef.current).toBe(true);

        // The remembered user is gone (account deletion): the prefilled
        // username must be dropped, not left in the field.
        act(() => {
            lastSignedIn = null;
            renderer!.update(<Harness />);
        });
        expect(username).toBe('');
    });
});

describe('getUsernamePrefill', () => {
    it('returns the username only when focused and a username exists', () => {
        expect(getUsernamePrefill(true, { uid: 'u1', username: 'alice' })).toBe('alice');
        expect(getUsernamePrefill(false, { uid: 'u1', username: 'alice' })).toBeNull();
        expect(getUsernamePrefill(true, { uid: 'u1', username: null })).toBeNull();
        expect(getUsernamePrefill(true, null)).toBeNull();
    });
});
