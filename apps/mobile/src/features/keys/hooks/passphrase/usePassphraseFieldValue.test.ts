import { beforeEach, describe, expect, it, vi } from 'vitest';

// The hook is exercised without a React renderer (no react-dom/test-utils in
// this repo); provide pass-through implementations for the hooks it uses,
// mirroring the pattern in keyItem/useKeyReveal.test.ts:
// - useState: call-order-keyed slots (reused on every mount via beginMount)
// - useRef: one stable object per slot (reused across mounts)
// - useCallback: identity preserved while deps are unchanged
// - useEffect: mini scheduler that runs an effect when its deps change
const reactState = vi.hoisted(() => {
    const values: Record<number, unknown> = {};
    const refs: Record<number, { current: unknown }> = {};
    const effectDeps: Record<number, unknown[]> = {};
    const callbackDeps: Record<number, unknown[]> = {};
    const callbackHas: Record<number, boolean> = {};
    const callbackValues: Record<number, unknown> = {};
    let key = 0;
    let refKey = 0;
    let effectKey = 0;
    let callbackKey = 0;
    return {
        beginMount: () => {
            key = 0;
            refKey = 0;
            effectKey = 0;
            callbackKey = 0;
        },
        reset: () => {
            key = 0;
            refKey = 0;
            effectKey = 0;
            callbackKey = 0;
            Object.keys(values).forEach(k => delete values[Number(k)]);
            Object.keys(refs).forEach(k => delete refs[Number(k)]);
            Object.keys(effectDeps).forEach(k => delete effectDeps[Number(k)]);
            Object.keys(callbackDeps).forEach(k => delete callbackDeps[Number(k)]);
            Object.keys(callbackHas).forEach(k => delete callbackHas[Number(k)]);
            Object.keys(callbackValues).forEach(k => delete callbackValues[Number(k)]);
        },
        nextCallbackKey: () => callbackKey++,
        nextEffectKey: () => effectKey++,
        nextKey: () => key++,
        nextRefKey: () => refKey++,
        callbackDeps,
        callbackHas,
        callbackValues,
        effectDeps,
        refs,
        values,
    };
});

vi.mock('react', () => ({
    useCallback: (fn: () => unknown, deps?: unknown[]) => {
        const k = reactState.nextCallbackKey();
        const nextDeps = deps ?? [];
        const prevDeps = reactState.callbackDeps[k];
        const changed = !reactState.callbackHas[k]
            || !prevDeps
            || prevDeps.length !== nextDeps.length
            || nextDeps.some((dep, i) => !Object.is(dep, prevDeps[i]));
        if (changed) {
            reactState.callbackDeps[k] = nextDeps;
            reactState.callbackHas[k] = true;
            reactState.callbackValues[k] = fn;
        }
        return reactState.callbackValues[k];
    },
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
    useRef: (initial: unknown) => {
        const k = reactState.nextRefKey();
        if (!reactState.refs[k]) {
            reactState.refs[k] = { current: initial };
        }
        return reactState.refs[k];
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

import { usePassphraseFieldValue } from './usePassphraseFieldValue';

const onPassphraseChange = vi.fn();
const onGeneratedPassphrase = vi.fn();

function mount(value?: string, callbacks: {
    onGeneratedPassphrase?: (passphrase: string) => void;
    onPassphraseChange?: (passphrase: string) => void;
} = {}) {
    reactState.beginMount();
    return usePassphraseFieldValue({
        value,
        onPassphraseChange: callbacks.onPassphraseChange ?? onPassphraseChange,
        onGeneratedPassphrase: callbacks.onGeneratedPassphrase ?? onGeneratedPassphrase,
    });
}

beforeEach(() => {
    reactState.reset();
    onPassphraseChange.mockClear();
    onGeneratedPassphrase.mockClear();
});

describe('usePassphraseFieldValue', () => {
    it('tracks typed values in uncontrolled mode and notifies the parent', () => {
        const result = mount();
        expect(result.currentValue).toBe('');

        result.commitPassphrase('s3cret');
        expect(onPassphraseChange).toHaveBeenCalledWith('s3cret');

        const updated = mount();
        expect(updated.currentValue).toBe('s3cret');
    });

    it('keeps the controlled value and never overrides it with commits', () => {
        const result = mount('controlled');
        expect(result.currentValue).toBe('controlled');

        result.commitPassphrase('ignored');
        // The prop still rules while controlled…
        expect(mount('controlled').currentValue).toBe('controlled');
        // …and the internal state was never touched: an uncontrolled remount
        // of the same slot still sees the empty initial value.
        expect(mount().currentValue).toBe('');
        expect(onPassphraseChange).toHaveBeenCalledWith('ignored');
    });

    it('keeps commitPassphrase stable while props are unchanged', () => {
        const first = mount();
        const commit = first.commitPassphrase;
        expect(mount().commitPassphrase).toBe(commit);
    });

    it('rebuilds commitPassphrase when the parent callback changes', () => {
        const first = mount();
        const commit = first.commitPassphrase;
        expect(mount().commitPassphrase).toBe(commit);

        // Change the callback identity → new commit closure.
        const replacement = vi.fn();
        const third = mount(undefined, { onPassphraseChange: replacement });
        expect(third.commitPassphrase).not.toBe(commit);
        third.commitPassphrase('x');
        expect(replacement).toHaveBeenCalledWith('x');
    });

    it('exposes a commitPassphraseRef that calls the latest commit closure', () => {
        const result = mount();
        expect(typeof result.commitPassphraseRef.current).toBe('function');

        result.commitPassphraseRef.current('via-ref');
        expect(mount().currentValue).toBe('via-ref');
    });

    it('mirrors the onGeneratedPassphrase prop into its ref', () => {
        const result = mount();
        expect(result.onGeneratedPassphraseRef.current).toBe(onGeneratedPassphrase);
    });

    it('keeps currentValueRef in sync with the rendered value', () => {
        const result = mount();
        expect(result.currentValueRef.current).toBe('');

        result.commitPassphrase('abc');
        mount();
        expect(result.currentValueRef.current).toBe('abc');
    });
});
