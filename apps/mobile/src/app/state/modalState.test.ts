import { describe, expect, it } from 'vitest';

import { modalPropsOf, modalTypeOf } from './modalState';
import type { ModalRequest } from '../../shared/modals/types';

describe('modal union dispatch', () => {
    it('maps no request to a closed modal', () => {
        expect(modalTypeOf(null)).toBeNull();
        expect(modalPropsOf(null)).toBeNull();
    });

    it('dispatches an mfa request to the mfa modal with its options', () => {
        const request: ModalRequest = {
            type: 'mfa',
            options: { isSensitive: true, isLoginFlow: true, message: 'Enter code' },
        };

        expect(modalTypeOf(request)).toBe('mfa');
        expect(modalPropsOf(request)).toEqual(request.options);
    });

    it('dispatches a recoveryCodes request with its options', () => {
        const request: ModalRequest = {
            type: 'recoveryCodes',
            options: { recoveryCodes: ['a1', 'b2'], source: 'setup' },
        };

        expect(modalTypeOf(request)).toBe('recoveryCodes');
        expect(modalPropsOf(request)).toEqual(request.options);
    });

    it('dispatches a passphraseStorageConsent request with no props', () => {
        const request: ModalRequest = { type: 'passphraseStorageConsent' };

        expect(modalTypeOf(request)).toBe('passphraseStorageConsent');
        expect(modalPropsOf(request)).toBeNull();
    });

    it('exhaustively covers every modal request variant', () => {
        const variants: ModalRequest[] = [
            { type: 'mfa', options: {} },
            { type: 'recoveryCodes', options: { recoveryCodes: [], source: 'regenerate' } },
            { type: 'passphraseStorageConsent' },
        ];

        const dispatched = variants.map(variant => ({
            type: modalTypeOf(variant),
            props: modalPropsOf(variant),
        }));

        expect(dispatched).toEqual([
            { type: 'mfa', props: {} },
            { type: 'recoveryCodes', props: { recoveryCodes: [], source: 'regenerate' } },
            { type: 'passphraseStorageConsent', props: null },
        ]);
    });
});
