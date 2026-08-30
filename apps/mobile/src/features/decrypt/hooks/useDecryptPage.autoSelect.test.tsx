import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

vi.mock('react-native', () => ({
    Platform: { OS: 'android' },
    NativeModules: {},
    AppState: { addEventListener: () => ({ remove: vi.fn() }), currentState: 'active' },
    StyleSheet: { create: (s: unknown) => s },
    View: () => null,
}));
vi.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: vi.fn(), replace: vi.fn(), goBack: vi.fn() }),
    useRoute: () => ({ params: {} }),
}));
vi.mock('../../../app/state/ToastContext', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../shared/hooks/useSecureCopy', () => ({
    useSecureCopy: () => ({ secureCopy: vi.fn(), wipeClipboard: vi.fn() }),
}));
vi.mock('../../../shared/hooks/useFilePicker', () => ({
    useFilePicker: () => ({ pickFile: vi.fn() }),
}));
vi.mock('../../../shared/hooks/useKeyPrerequisiteRedirect', () => ({
    useKeyPrerequisiteRedirect: () => ({ isRedirecting: false }),
}));
vi.mock('../../../shared/hooks/useResetStateOnBlurSuccess', () => ({
    useResetStateOnBlurSuccess: () => undefined,
}));
vi.mock('../../../services/pgpCryptoService', () => ({
    pgpCryptoService: {
        validatePrivateKeyPassphrase: vi.fn(async () => true),
        decryptMessage: vi.fn(async () => ({ decrypted: 'plain', verified: null })),
        extractKeyMetadata: vi.fn(),
    },
}));

const makeKey = (fingerprint: string, overrides: Record<string, unknown> = {}) => ({
    fingerprint,
    publicKey: 'pk',
    privateKey: 'sk',
    isDefault: false,
    isCompletePair: true,
    userId: 'test@example.test',
    privateKeyIsUnlocked: false,
    recordId: `rec-${fingerprint}`,
    ...overrides,
});

let visibleKeysValue: Array<ReturnType<typeof makeKey>> = [];

vi.mock('../../auth/state/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'u1' },
        isAuthLoading: false,
        userDecrypted: { keys: visibleKeysValue, dek: 'dek' },
        visibleKeys: visibleKeysValue,
    }),
}));

import { useDecryptPage } from './useDecryptPage';
import type { KeySelectionMap } from '../model/types';

let lastSelected: KeySelectionMap | null = null;

function Probe() {
    const page = useDecryptPage();
    lastSelected = page.state.selectedPrivateKey;
    return null;
}

describe('useDecryptPage auto-select (E2E-caught regression: decrypt did nothing because no key was selected)', () => {
    beforeEach(() => {
        visibleKeysValue = [makeKey('fp-default', { isDefault: true })];
        lastSelected = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('auto-selects the default private key when keys are present at mount', () => {
        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<Probe />);
        });
        act(() => {
            renderer!.update(<Probe />);
        });
        expect(lastSelected).toEqual({ 'fp-default': 'sk' });
        act(() => {
            renderer!.unmount();
        });
    });

    it('auto-selects the first private key when no key is marked default', () => {
        visibleKeysValue = [makeKey('fp-a'), makeKey('fp-b', { isDefault: true })];
        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<Probe />);
        });
        act(() => {
            renderer!.update(<Probe />);
        });
        expect(lastSelected).toEqual({ 'fp-b': 'sk' });
        act(() => {
            renderer!.unmount();
        });
    });

    it('does not auto-select when keys arrive after mount (the timing gap)', () => {
        // Simulate the E2E scenario: screen mounts BEFORE keys are decrypted.
        visibleKeysValue = [];
        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<Probe />);
        });
        act(() => {
            renderer!.update(<Probe />);
        });
        expect(lastSelected).toEqual({});

        // Keys arrive -> visibleKeys identity changes -> effect must re-fire.
        visibleKeysValue = [makeKey('fp-late', { isDefault: true })];
        act(() => {
            renderer!.update(<Probe />);
        });
        expect(lastSelected).toEqual({ 'fp-late': 'sk' });
        act(() => {
            renderer!.unmount();
        });
    });
});
