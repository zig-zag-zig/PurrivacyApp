import { useCallback, useEffect, useRef } from 'react';

import {
    deleteEncryptedSqliteValue,
    getEncryptedSqliteValue,
    setEncryptedSqliteValue,
} from '../../features/security/services/encryptedSqliteValueStore';
import { logger } from '../../utils/logger';

const DRAFT_DEBOUNCE_MS = 600;

/**
 * Per-user encrypted draft store. Drafts are plaintext messages (or pasted
 * ciphertext) — sensitive — so they go through the AES-GCM sqlite store, never
 * plaintext disk. Keys are namespaced per user so two accounts on one device do
 * not share drafts.
 */
const draftKey = (userId: string, slot: string): string =>
    `draft:${slot}:${userId}`;

export const draftService = {
    load: async (userId: string, slot: string): Promise<string | null> => {
        try {
            return await getEncryptedSqliteValue(draftKey(userId, slot));
        } catch (error) {
            logger.warn('draft load failed', { slot, error });
            return null;
        }
    },
    save: async (userId: string, slot: string, value: string): Promise<void> => {
        try {
            if (!value.trim()) {
                await deleteEncryptedSqliteValue(draftKey(userId, slot));
                return;
            }
            await setEncryptedSqliteValue(draftKey(userId, slot), value);
        } catch (error) {
            logger.warn('draft save failed', { slot, error });
        }
    },
    clear: async (userId: string, slot: string): Promise<void> => {
        try {
            await deleteEncryptedSqliteValue(draftKey(userId, slot));
        } catch (error) {
            logger.warn('draft clear failed', { slot, error });
        }
    },
};

type UseComposeDraftParams = {
    userId: string | undefined;
    slot: string;
    value: string;
    onRestore: (value: string) => void;
    /** When true the draft is cleared (e.g. after a successful encrypt). */
    shouldClear?: boolean;
};

/**
 * Auto-persist a compose field to the encrypted draft store. Restores once on
 * mount, saves on change (debounced), and clears when `shouldClear` flips true
 * or the value is emptied. Best-effort: failures are logged, never thrown.
 */
export function useComposeDraft({
    userId,
    slot,
    value,
    onRestore,
    shouldClear = false,
}: UseComposeDraftParams): void {
    const restoredRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onRestoreRef = useRef(onRestore);
    const valueRef = useRef(value);
    onRestoreRef.current = onRestore;
    valueRef.current = value;

    // Restore once per user+slot. `restoredRef` flips inside the load callback
    // so a draft is applied at most once, and before the save effect runs.
    useEffect(() => {
        restoredRef.current = false;
        if (!userId) return;
        let cancelled = false;
        void draftService.load(userId, slot).then(draft => {
            restoredRef.current = true;
            // Only restore when the field is still empty — never clobber text
            // the user typed while the async load was in flight.
            if (!cancelled && draft && !valueRef.current) {
                onRestoreRef.current(draft);
            }
        });
        return () => { cancelled = true; };
    }, [userId, slot]);

    // Clear on success.
    useEffect(() => {
        if (shouldClear && userId) {
            void draftService.clear(userId, slot);
        }
    }, [shouldClear, userId, slot]);

    // Debounced save on change (after the initial restore so we don't clobber a
    // stored draft with the empty initial value before it loads).
    useEffect(() => {
        if (!userId || !restoredRef.current) return;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void draftService.save(userId, slot, value);
        }, DRAFT_DEBOUNCE_MS);
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [userId, slot, value]);
}
