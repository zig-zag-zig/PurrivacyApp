/**
 * Pure state helpers for the modal provider's discriminated-union state.
 * Extracted so the union dispatch (type → renderable props) is unit-testable
 * without rendering React components.
 */

import type {
    MfaModalOptions,
    ModalRequest,
    RecoveryCodesModalOptions,
} from '../../shared/modals/types';

/** The active modal's discriminant, or null when no modal is open. */
export type ModalType = ModalRequest['type'] | null;

/** Derives the visible modal type from a modal request. */
export const modalTypeOf = (state: ModalRequest | null): ModalType =>
    state?.type ?? null;

/**
 * Derives the props exposed for the active modal. The passphrase-consent
 * modal carries no options, so it maps to null like the closed state.
 */
export const modalPropsOf = (
    state: ModalRequest | null,
): MfaModalOptions | RecoveryCodesModalOptions | null => {
    if (!state) {
        return null;
    }
    return state.type === 'passphraseStorageConsent' ? null : state.options;
};
