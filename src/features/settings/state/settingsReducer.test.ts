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

    it('toggles biometricToggleLoadingChanged', () => {
        const result = settingsReducer(initialSettingsState, {
            type: 'biometricToggleLoadingChanged',
            loading: true,
        });
        expect(result.biometricToggleLoading).toBe(true);
    });
});
