import { beforeEach, describe, expect, it } from 'vitest';
import { EventService, isAppEventName } from '../services/eventService';

beforeEach(() => {
    EventService.resetForTesting();
});

describe('EventService', () => {
    describe('addEvent + consumeEvent', () => {
        it('stores an event payload and notifies listeners', () => {
            const received: Array<{ name: string; payload: unknown }> = [];
            const unsubscribe = EventService.addListener((name, payload) => {
                received.push({ name, payload });
            });

            try {
                EventService.addEvent('mfaState', {
                    mfaState: { mfaTrusted: true, mfaEnabled: true },
                });

                expect(received).toContainEqual({
                    name: 'mfaState',
                    payload: { mfaState: { mfaTrusted: true, mfaEnabled: true } },
                });
            } finally {
                unsubscribe();
            }
        });

        it('consumeEvent returns the pending payload and removes it', () => {
            EventService.addEvent('signOut', undefined);

            expect(EventService.consumeEvent('signOut')).toBeUndefined();
            expect(EventService.consumeEvent('signOut')).toBeUndefined();
        });

        it('consumeEvent returns undefined when no event was pending', () => {
            expect(EventService.consumeEvent('user')).toBeUndefined();
        });

        it('addEvent without payload stores undefined and notifies', () => {
            const received: Array<{ name: string; payload: unknown }> = [];
            const unsubscribe = EventService.addListener((name, payload) => {
                received.push({ name, payload });
            });

            try {
                EventService.addEvent('signOut', undefined);

                expect(received).toContainEqual({
                    name: 'signOut',
                    payload: undefined,
                });
                expect(EventService.consumeEvent('signOut')).toBeUndefined();
            } finally {
                unsubscribe();
            }
        });
    });

    describe('addListener', () => {
        it('returns an unsubscribe function that removes the listener', () => {
            const calls: string[] = [];
            const unsubscribe = EventService.addListener((name) => {
                calls.push(name);
            });

            EventService.addEvent('user', undefined);
            expect(calls).toEqual(['user']);

            unsubscribe();

            EventService.addEvent('signOut', undefined);
            expect(calls).toEqual(['user']);
        });

        it('multiple listeners all receive events', () => {
            const a: string[] = [];
            const b: string[] = [];

            const unsubA = EventService.addListener((name) => { a.push(name); });
            const unsubB = EventService.addListener((name) => { b.push(name); });

            try {
                EventService.addEvent('user', undefined);
                expect(a).toEqual(['user']);
                expect(b).toEqual(['user']);
            } finally {
                unsubA();
                unsubB();
            }
        });
    });

    describe('getPendingEvents', () => {
        it('returns a snapshot copy of pending events', () => {
            EventService.addEvent('mfaState', {
                mfaState: { mfaTrusted: true, mfaEnabled: true },
            });
            EventService.addEvent('signOut', undefined);

            const snapshot = EventService.getPendingEvents();

            expect(snapshot.size).toBe(2);
            expect(snapshot.get('mfaState')).toEqual({
                mfaState: { mfaTrusted: true, mfaEnabled: true },
            });
            expect(snapshot.get('signOut')).toBeUndefined();

            // Mutating snapshot does not affect internals
            snapshot.clear();
            expect(EventService.consumeEvent('mfaState')).toEqual({
                mfaState: { mfaTrusted: true, mfaEnabled: true },
            });
        });
    });

    describe('isAppEventName', () => {
        it('accepts known event names', () => {
            expect(isAppEventName('clearMfaCode')).toBe(true);
            expect(isAppEventName('closeMfaModal')).toBe(true);
            expect(isAppEventName('devTempKeys')).toBe(true);
            expect(isAppEventName('mfaState')).toBe(true);
            expect(isAppEventName('newRecoveryCodes')).toBe(true);
            expect(isAppEventName('signOut')).toBe(true);
            expect(isAppEventName('user')).toBe(true);
        });

        it('rejects unknown event names', () => {
            expect(isAppEventName('unknownEvent')).toBe(false);
            expect(isAppEventName('')).toBe(false);
            expect(isAppEventName('clearMfaCod')).toBe(false);
        });
    });

    describe('resetForTesting', () => {
        it('clears all pending events and listeners', () => {
            const calls: string[] = [];
            const unsubscribe = EventService.addListener((name) => {
                calls.push(name);
            });

            EventService.addEvent('signOut', undefined);

            EventService.resetForTesting();

            expect(EventService.getPendingEvents().size).toBe(0);
            expect(EventService.consumeEvent('signOut')).toBeUndefined();

            // Listener should also be cleared
            EventService.addEvent('user', undefined);
            expect(calls).toEqual(['signOut']); // only the first event before reset reached it

            unsubscribe();
        });
    });
});
