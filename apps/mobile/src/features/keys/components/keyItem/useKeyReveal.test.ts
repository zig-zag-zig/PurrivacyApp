import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authenticateForSecretReveal: vi.fn(),
    credential: vi.fn(),
    dismiss: vi.fn(),
    hasStandaloneBiometricAuth: vi.fn(),
    isBiometricAuthCancelled: vi.fn(),
    markCopied: vi.fn(),
    reauthenticateWithCredential: vi.fn(),
    secureCopy: vi.fn(),
    setLoginWithReauthenticateWithCredential: vi.fn(),
    showToast: vi.fn(),
}));

// Auth context values are mutable per-test.
const authState = vi.hoisted(() => ({
    user: null as { email: string | null } | null,
    isBiometricAvailable: false,
    isBiometricEnabled: false,
}));

// The hook is exercised without a React renderer (no react-dom/test-utils in
// this repo); provide pass-through implementations for the hooks it uses:
// - useState: call-order-keyed slots (reused on every mount via beginMount)
// - useEffect: mini scheduler that runs an effect when its deps change,
//   mirroring React's mount/update semantics for the reveal-clear effects.
const reactState = vi.hoisted(() => {
    const values: Record<number, unknown> = {};
    const effectDeps: Record<number, unknown[]> = {};
    let key = 0;
    let effectKey = 0;
    return {
        beginMount: () => {
            key = 0;
            effectKey = 0;
        },
        effectDeps,
        reset: () => {
            key = 0;
            effectKey = 0;
            Object.keys(values).forEach(k => delete values[Number(k)]);
            Object.keys(effectDeps).forEach(k => delete effectDeps[Number(k)]);
        },
        nextEffectKey: () => effectKey++,
        nextKey: () => key++,
        values,
    };
});

vi.mock('react', () => ({
    useEffect: (fn: () => void, deps?: unknown[]) => {
        const k = reactState.nextEffectKey();
        const nextDeps = deps ?? [];
        const prevDeps = reactState.effectDeps[k];
        const changed = !prevDeps
            || prevDeps.length !== nextDeps.length
            || nextDeps.some((dep, i) => !Object.is(dep, prevDeps[i]));
        if (changed) {
            reactState.effectDeps[k] = nextDeps;
            fn();
        }
    },
    useState: (initial: unknown) => {
        const k = reactState.nextKey();
        reactState.values[k] = reactState.values[k] === undefined ? initial : reactState.values[k];
        const set = (value: unknown) => {
            reactState.values[k] = typeof value === 'function'
                ? (value as (prev: unknown) => unknown)(reactState.values[k])
                : value;
        };
        return [reactState.values[k], set];
    },
}));

vi.mock('react-native', () => ({
    Keyboard: { dismiss: mocks.dismiss },
}));

vi.mock('firebase/auth', () => ({
    EmailAuthProvider: { credential: mocks.credential },
    reauthenticateWithCredential: mocks.reauthenticateWithCredential,
}));

vi.mock('../../../auth/state/AuthContext', () => ({
    useAuth: () => ({
        isBiometricAvailable: authState.isBiometricAvailable,
        isBiometricEnabled: authState.isBiometricEnabled,
        setLoginWithReauthenticateWithCredential: mocks.setLoginWithReauthenticateWithCredential,
        user: authState.user,
    }),
}));

vi.mock('../../../security/services/securityService', () => ({
    securityService: {
        authenticateForSecretReveal: mocks.authenticateForSecretReveal,
        hasStandaloneBiometricAuth: mocks.hasStandaloneBiometricAuth,
        isBiometricAuthCancelled: mocks.isBiometricAuthCancelled,
    },
}));

vi.mock('../../../../shared/hooks/useCopyFeedback', () => ({
    useCopyFeedback: () => ({ copied: false, markCopied: mocks.markCopied }),
}));

vi.mock('../../../../shared/hooks/useSecureCopy', () => ({
    useSecureCopy: () => ({ secureCopy: mocks.secureCopy }),
}));

vi.mock('../../../../app/state/ToastContext', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

import { useKeyReveal } from './useKeyReveal';
import type { KeyPair } from '../../../../types/types';

const pgpKey = {
    algorithm: 'RSA',
    expiry: '2026-01-01',
    fingerprint: 'FPRINT-1',
    isDefault: false,
    privateKey: 'PRIVATE-KEY-MATERIAL',
    privateKeyIsUnlocked: true,
    publicKey: 'PUBLIC-KEY-MATERIAL',
    userId: 'alice@example.com',
} as KeyPair;

function mount(key = pgpKey, expanded = true) {
    // Reuse the same useState slots on every mount so state persists across
    // mounts within a test (call order is deterministic per hook run).
    reactState.beginMount();
    return useKeyReveal(key, expanded);
}

function enableBiometricPolicy(enabled = true) {
    authState.isBiometricAvailable = true;
    authState.isBiometricEnabled = true;
    mocks.hasStandaloneBiometricAuth.mockReturnValue(enabled);
}

beforeEach(() => {
    vi.clearAllMocks();
    reactState.reset();
    authState.user = null;
    authState.isBiometricAvailable = false;
    authState.isBiometricEnabled = false;
    mocks.hasStandaloneBiometricAuth.mockReturnValue(false);
    mocks.isBiometricAuthCancelled.mockReturnValue(false);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useKeyReveal biometric policy', () => {
    it('requires availability, enablement and the standalone biometric policy', () => {
        // Nothing enabled: policy short-circuits before the service call.
        expect(mount().canRevealWithBiometrics).toBe(false);
        expect(mocks.hasStandaloneBiometricAuth).not.toHaveBeenCalled();

        authState.isBiometricAvailable = true;
        authState.isBiometricEnabled = true;
        mocks.hasStandaloneBiometricAuth.mockReturnValue(false);
        expect(mount().canRevealWithBiometrics).toBe(false);
        expect(mocks.hasStandaloneBiometricAuth).toHaveBeenCalledTimes(1);

        mocks.hasStandaloneBiometricAuth.mockReturnValue(true);
        expect(mount().canRevealWithBiometrics).toBe(true);
        expect(mocks.hasStandaloneBiometricAuth).toHaveBeenCalledTimes(2);
    });
});

describe('useKeyReveal account-password authorization', () => {
    it('rejects an empty account password', async () => {
        const reveal = mount();
        await reveal.handleRevealWithAccountPassword();

        expect(mocks.reauthenticateWithCredential).not.toHaveBeenCalled();
        expect(mount().revealError).toBe('Account password is required');
        expect(mount().privateKeyVisible).toBe(false);
    });

    it('rejects reveal when the user has no verified email', async () => {
        authState.user = { email: null };
        const reveal = mount();
        reveal.setAccountPassword('secret');
        await mount().handleRevealWithAccountPassword();

        expect(mocks.reauthenticateWithCredential).not.toHaveBeenCalled();
        expect(mount().revealError).toBe('Sign in again before revealing private keys');
    });

    it('reveals the private key after successful reauthentication', async () => {
        authState.user = { email: 'alice@example.com' };
        mocks.reauthenticateWithCredential.mockResolvedValue({} as never);
        mocks.credential.mockReturnValue({} as never);

        const reveal = mount();
        reveal.setAccountPassword('secret');
        // Re-mount so the handler closure sees the updated password.
        await mount().handleRevealWithAccountPassword();

        expect(mocks.credential).toHaveBeenCalledWith('alice@example.com', 'secret');
        expect(mocks.reauthenticateWithCredential).toHaveBeenCalledTimes(1);
        expect(mocks.setLoginWithReauthenticateWithCredential).toHaveBeenNthCalledWith(1, true);
        expect(mocks.setLoginWithReauthenticateWithCredential).toHaveBeenLastCalledWith(false);
        expect(mount().privateKeyVisible).toBe(true);
        expect(mount().revealError).toBe('');
    });

    it('maps wrong-password failures to a friendly error', async () => {
        authState.user = { email: 'alice@example.com' };
        mocks.reauthenticateWithCredential.mockRejectedValue({ code: 'auth/wrong-password' } as never);

        const reveal = mount();
        reveal.setAccountPassword('wrong');
        await mount().handleRevealWithAccountPassword();

        expect(mount().revealError).toBe('Incorrect account password');
        expect(mount().privateKeyVisible).toBe(false);
        expect(mount().revealLoading).toBeNull();
    });

    it('maps unexpected reauthentication failures to a generic error', async () => {
        authState.user = { email: 'alice@example.com' };
        mocks.reauthenticateWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' } as never);

        const reveal = mount();
        reveal.setAccountPassword('secret');
        await mount().handleRevealWithAccountPassword();

        expect(mount().revealError).toBe('Could not verify account password');
    });
});

describe('useKeyReveal biometric authorization', () => {
    it('never prompts when the biometric policy is not satisfied', async () => {
        const reveal = mount();
        await reveal.handleRevealWithBiometric();

        expect(mocks.authenticateForSecretReveal).not.toHaveBeenCalled();
        expect(mount().privateKeyVisible).toBe(false);
    });

    it('reveals the private key after a successful biometric prompt', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockResolvedValue(true as never);

        const reveal = mount();
        await reveal.handleRevealWithBiometric();

        expect(mocks.authenticateForSecretReveal).toHaveBeenCalledWith('Unlock private key');
        expect(mount().privateKeyVisible).toBe(true);
        expect(mount().revealLoading).toBeNull();
    });

    it('surfaces an unavailable message when the prompt is denied', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockResolvedValue(false as never);

        const reveal = mount();
        await reveal.handleRevealWithBiometric();

        expect(mount().revealError).toBe('Biometric unlock is unavailable');
    });

    it('ignores user-cancelled biometric prompts', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockRejectedValue(new Error('cancelled'));
        mocks.isBiometricAuthCancelled.mockReturnValue(true);

        const reveal = mount();
        await reveal.handleRevealWithBiometric();

        expect(mount().revealError).toBe('');
    });

    it('maps failed biometric prompts to a generic error', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockRejectedValue(new Error('hardware error'));

        const reveal = mount();
        await reveal.handleRevealWithBiometric();

        expect(mount().revealError).toBe('Biometric unlock failed');
    });
});

describe('useKeyReveal private-key copy authorization', () => {
    it('requires the key to be revealed before offering a copy', () => {
        const reveal = mount();
        reveal.handleCopyPrivateKey();

        expect(mount().copyConfirmVisible).toBe(false);
        expect(mocks.dismiss).not.toHaveBeenCalled();
    });

    it('requests explicit confirmation before copying a revealed key', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockResolvedValue(true as never);

        const reveal = mount();
        await reveal.handleRevealWithBiometric();
        const revealed = mount();
        revealed.handleCopyPrivateKey();

        expect(mocks.dismiss).toHaveBeenCalledTimes(1);
        expect(mount().copyConfirmVisible).toBe(true);
        expect(mocks.secureCopy).not.toHaveBeenCalled();
    });

    it('copies only after explicit confirmation (APP-SEC-005)', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockResolvedValue(true as never);

        const reveal = mount();
        await reveal.handleRevealWithBiometric();
        const revealed = mount();
        revealed.handleCopyPrivateKey();
        revealed.confirmCopyPrivateKey();

        expect(mocks.secureCopy).toHaveBeenCalledWith('PRIVATE-KEY-MATERIAL', { sensitivity: 'high' });
        expect(mocks.markCopied).toHaveBeenCalledTimes(1);
        expect(mocks.showToast).toHaveBeenCalledWith('Private key copied', 'success');
        expect(mount().copyConfirmVisible).toBe(false);
    });
});

describe('useKeyReveal state resets', () => {
    it('clears reveal state on collapse (expanded=false)', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockResolvedValue(true as never);

        const reveal = mount(pgpKey, true);
        await reveal.handleRevealWithBiometric();
        expect(mount(pgpKey, true).privateKeyVisible).toBe(true);

        mount(pgpKey, false);
        const collapsed = mount(pgpKey, false);
        expect(collapsed.privateKeyVisible).toBe(false);
        expect(collapsed.accountPassword).toBe('');
        expect(collapsed.revealError).toBe('');
        expect(collapsed.revealLoading).toBeNull();
    });

    it('clearPrivateKeyReveal resets reveal state but keeps an open copy confirmation', async () => {
        enableBiometricPolicy(true);
        mocks.authenticateForSecretReveal.mockResolvedValue(true as never);

        const reveal = mount();
        await reveal.handleRevealWithBiometric();
        const revealed = mount();
        revealed.handleCopyPrivateKey();
        expect(mount().copyConfirmVisible).toBe(true);

        revealed.clearPrivateKeyReveal();
        const fresh = mount();
        expect(fresh.privateKeyVisible).toBe(false);
        expect(fresh.accountPassword).toBe('');
        expect(fresh.revealError).toBe('');
        expect(fresh.revealLoading).toBeNull();
        // Verbatim extraction: clearPrivateKeyReveal never touches copyConfirmVisible.
        expect(fresh.copyConfirmVisible).toBe(true);
    });
});
