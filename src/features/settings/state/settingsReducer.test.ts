import { describe, expect, it } from 'vitest';

import { settingsReducer, initialSettingsState } from './settingsReducer';

describe('settingsReducer', () => {
    it('toggles deleteDialogChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'deleteDialogChanged',
            visible: true,
        });
        expect(result.showDeleteDialog).toBe(true);
    });

    it('toggles disableMfaDialogChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'disableMfaDialogChanged',
            visible: true,
        });
        expect(result.showDisableMfaDialog).toBe(true);
    });

    it('toggles revokeSessionsLoadingChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'revokeSessionsLoadingChanged',
            loading: true,
        });
        expect(result.revokeSessionsLoading).toBe(true);
    });

    it('toggles disableMfaLoadingChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'disableMfaLoadingChanged',
            loading: true,
        });
        expect(result.disableMfaLoading).toBe(true);
    });

    it('toggles regenerateCodesLoadingChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'regenerateCodesLoadingChanged',
            loading: true,
        });
        expect(result.regenerateCodesLoading).toBe(true);
    });

    it('toggles biometricToggleLoadingChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'biometricToggleLoadingChanged',
            loading: true,
        });
        expect(result.biometricToggleLoading).toBe(true);
    });
});
