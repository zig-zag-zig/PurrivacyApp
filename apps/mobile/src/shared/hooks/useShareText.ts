import { useCallback } from 'react';
import { Share } from 'react-native';

import { logger } from '../../utils/logger';

/**
 * Outbound share for text payloads (ciphertext, signatures, public keys).
 * Wraps the platform share sheet so a result can be handed to a trusted app
 * instead of the clipboard — see the clipboard-lifetime review notes.
 *
 * Returns a stable callback; share failures are logged and swallowed because
 * the sheet is a best-effort user action, not a state transition.
 */
export function useShareText() {
    const shareText = useCallback(async (text: string, dialogTitle?: string) => {
        if (!text.trim()) return;
        try {
            await Share.share(
                { message: text },
                dialogTitle ? { dialogTitle } : undefined,
            );
        } catch (error) {
            // Share sheet dismissal/cancellation resolves with action=dismissedAction
            // on some platforms rather than throwing; a thrown error here is a real
            // failure (e.g. no handler). Log, don't surface a toast for a cancelled share.
            logger.warn('shareText failed', { error });
        }
    }, []);

    return { shareText };
}
