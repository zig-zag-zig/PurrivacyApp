import { useEffect, useRef, useState } from 'react';

import { logger } from '../../utils/logger';

const DRAFT_DEBOUNCE_MS = 600;

/**
 * Storage abstraction for compose drafts. The hook depends on this interface —
 * not on the concrete encrypted sqlite store — so tests and the module boundary
 * stay free of the expo-crypto native chain.
 */
export interface DraftStore {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
}

/** Draft keys are namespaced per user so accounts on one device don't share. */
const draftKey = (userId: string, slot: string): string =>
    `draft:${slot}:${userId}`;

/**
 * Per-user draft persistence over an injected store. Drafts are plaintext
 * messages / pasted ciphertext — sensitive — so the injected store must be the
 * encrypted sqlite value store (see useComposeDraft.ts binding), never a
 * plaintext backend.
 */
export const createDraftService = (store: DraftStore) => {
    const clearedUsers = new Set<string>();
    const pendingWrites = new Map<string, Set<Promise<void>>>();

    const clear = async (userId: string, slot: string): Promise<void> => {
        try {
            await store.removeItem(draftKey(userId, slot));
        } catch (error) {
            logger.warn('draft clear failed', { slot, error });
        }
    };

    return {
        load: async (userId: string, slot: string): Promise<string | null> => {
            try {
                return await store.getItem(draftKey(userId, slot));
            } catch (error) {
                logger.warn('draft load failed', { slot, error });
                return null;
            }
        },
        save: async (userId: string, slot: string, value: string): Promise<void> => {
            if (clearedUsers.has(userId)) return;
            const key = draftKey(userId, slot);
            const write = (async () => {
                try {
                    if (!value.trim()) {
                        await store.removeItem(key);
                        return;
                    }
                    await store.setItem(key, value);
                    // If sign-out began while the write was in flight, remove
                    // the just-written value before that cleanup can complete.
                    if (clearedUsers.has(userId)) await store.removeItem(key);
                } catch (error) {
                    logger.warn('draft save failed', { slot, error });
                }
            })();
            const writes = pendingWrites.get(userId) ?? new Set<Promise<void>>();
            writes.add(write);
            pendingWrites.set(userId, writes);
            try {
                await write;
            } finally {
                writes.delete(write);
                if (writes.size === 0) pendingWrites.delete(userId);
            }
        },
        clear,
        allowUser: (userId: string): void => {
            if (userId.trim()) clearedUsers.delete(userId);
        },
        clearForUser: async (userId: string): Promise<void> => {
            if (!userId.trim()) return;
            clearedUsers.add(userId);
            await Promise.all(Array.from(pendingWrites.get(userId) ?? []));
            await Promise.all(['encrypt', 'decrypt'].map(slot => clear(userId, slot)));
        },
    };
};

export type DraftService = ReturnType<typeof createDraftService>;

type UseComposeDraftParams = {
    userId: string | undefined;
    slot: string;
    value: string;
    onRestore: (value: string) => void;
    /** When true the draft is cleared (e.g. after a successful encrypt). */
    shouldClear?: boolean;
    /** The backing service. Callers pass the bound instance (see drafts.ts). */
    service: DraftService;
};

/**
 * Auto-persist a compose field. Restores once on mount, saves on change
 * (debounced), and clears when `shouldClear` flips true or the value is
 * emptied. Best-effort: failures are logged, never thrown.
 */
export function useComposeDraft({
    userId,
    slot,
    value,
    onRestore,
    shouldClear = false,
    service,
}: UseComposeDraftParams): void {
    // Track restore completion in state (not only a ref) so the save effect
    // re-runs once the load resolves — a ref alone can't re-trigger the save.
    const [restored, setRestored] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onRestoreRef = useRef(onRestore);
    const valueRef = useRef(value);
    const serviceRef = useRef(service);
    onRestoreRef.current = onRestore;
    valueRef.current = value;
    serviceRef.current = service;

    // Restore once per user+slot. `restored` flips inside the load callback so a
    // draft is applied at most once, and the save effect (keyed on `restored`)
    // can begin only after the load has resolved.
    useEffect(() => {
        setRestored(false);
        if (!userId) return;
        serviceRef.current.allowUser(userId);
        let cancelled = false;
        void serviceRef.current.load(userId, slot).then(draft => {
            if (cancelled) return;
            // Only restore when the field is still empty — never clobber text
            // the user typed while the async load was in flight.
            if (draft && !valueRef.current) {
                onRestoreRef.current(draft);
            }
            setRestored(true);
        });
        return () => { cancelled = true; };
    }, [userId, slot]);

    // Clear on success.
    useEffect(() => {
        if (shouldClear && userId) {
            void serviceRef.current.clear(userId, slot);
        }
    }, [shouldClear, userId, slot]);

    // Debounced save on change (after the initial restore so we don't clobber a
    // stored draft with the empty initial value before it loads).
    useEffect(() => {
        if (!userId || !restored) return;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void serviceRef.current.save(userId, slot, value);
        }, DRAFT_DEBOUNCE_MS);
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [userId, slot, value, restored]);
}
