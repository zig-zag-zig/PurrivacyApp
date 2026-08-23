import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KeyPair } from '../../../../types/types';
import { theme } from '../../../../styles/theme';

// The hook is exercised without a React renderer (no react-dom/test-utils in
// this repo); provide pass-through implementations for the hooks it uses,
// mirroring the pattern in keyItem/useKeyReveal.test.ts:
// - useState: call-order-keyed slots (reused on every mount via beginMount)
// - useEffect: mini scheduler that runs an effect when its deps change
// - useMemo: mini cache that recomputes when its deps change
const reactState = vi.hoisted(() => {
    const values: Record<number, unknown> = {};
    const effectDeps: Record<number, unknown[]> = {};
    const memoDeps: Record<number, unknown[]> = {};
    const memoHas: Record<number, boolean> = {};
    const memoValues: Record<number, unknown> = {};
    let key = 0;
    let effectKey = 0;
    let memoKey = 0;
    return {
        beginMount: () => {
            key = 0;
            effectKey = 0;
            memoKey = 0;
        },
        reset: () => {
            key = 0;
            effectKey = 0;
            memoKey = 0;
            Object.keys(values).forEach(k => delete values[Number(k)]);
            Object.keys(effectDeps).forEach(k => delete effectDeps[Number(k)]);
            Object.keys(memoDeps).forEach(k => delete memoDeps[Number(k)]);
            Object.keys(memoHas).forEach(k => delete memoHas[Number(k)]);
            Object.keys(memoValues).forEach(k => delete memoValues[Number(k)]);
        },
        nextEffectKey: () => effectKey++,
        nextKey: () => key++,
        nextMemoKey: () => memoKey++,
        effectDeps,
        memoDeps,
        memoHas,
        memoValues,
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
    useMemo: (fn: () => unknown, deps?: unknown[]) => {
        const k = reactState.nextMemoKey();
        const nextDeps = deps ?? [];
        const prevDeps = reactState.memoDeps[k];
        const changed = !reactState.memoHas[k]
            || !prevDeps
            || prevDeps.length !== nextDeps.length
            || nextDeps.some((dep, i) => !Object.is(dep, prevDeps[i]));
        if (changed) {
            reactState.memoDeps[k] = nextDeps;
            reactState.memoHas[k] = true;
            reactState.memoValues[k] = fn();
        }
        return reactState.memoValues[k];
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

// The sort helpers import the popularity store; stub it so the module graph
// loads in the node test environment (sort functions never touch the store).
vi.mock('../../../../utils/stores/popularityStore', () => ({
    popularityStore: {},
}));

import { useKeySelectionList } from './useKeySelectionList';

const makeKey = (fingerprint: string, userId: string): KeyPair => ({
    algorithm: 'RSA',
    expiry: '2026-01-01',
    fingerprint,
    isDefault: false,
    privateKey: null,
    publicKey: 'pk',
    userId,
} as KeyPair);

const keys = [
    makeKey('fp1', 'Alice <alice@example.com>'),
    makeKey('fp2', 'Bob <bob@example.com>'),
    makeKey('fp3', 'Charlie <charlie@example.com>'),
];

const popularityMap = { fp1: 10, fp2: 5, fp3: 1 };

let displaySelectedKeys: { [fingerprint: string]: string };
let currentPopularityMap: Record<string, number>;

function mount() {
    reactState.beginMount();
    return useKeySelectionList({
        keys,
        displaySelectedKeys,
        popularityMap: currentPopularityMap,
    });
}

beforeEach(() => {
    reactState.reset();
    displaySelectedKeys = {};
    currentPopularityMap = { ...popularityMap };
});

describe('useKeySelectionList ordering', () => {
    it('sorts by popularity (descending) by default', () => {
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);
    });

    it('groups selected keys first when not searching', () => {
        displaySelectedKeys = { fp2: 'x' };
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp2', 'fp1', 'fp3']);
    });

    it('switches to alphabetical ascending and toggles to descending', () => {
        const first = mount();
        first.handleAlphabeticalPress();
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);

        mount().handleAlphabeticalPress();
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp3', 'fp2', 'fp1']);
    });

    it('filters keys case-insensitively by userId substring', () => {
        const result = mount();
        result.setSearchQuery('ALICE');
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp1']);
    });

    it('sorts by popularity while searching regardless of the chosen sort', () => {
        const result = mount();
        result.handleAlphabeticalPress();
        result.setSearchQuery('example');
        const searched = mount();
        expect(searched.displayKeys.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);
    });

    it('freezes the popularity snapshot while searching and restores live values on clear', () => {
        const result = mount();
        result.setSearchQuery('example');
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);

        // Popularity flips while the query is still active: ordering must not change.
        currentPopularityMap = { fp1: 1, fp2: 5, fp3: 10 };
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);

        // Clearing the search drops the snapshot and uses the live map again.
        // (One render shows the stale snapshot until the clear effect applies,
        // mirroring React's effect-after-render cycle.)
        mount().setSearchQuery('');
        mount();
        expect(mount().displayKeys.map(k => k.fingerprint)).toEqual(['fp3', 'fp2', 'fp1']);
    });

    it('shows no results for a query that matches nothing', () => {
        const result = mount();
        result.setSearchQuery('zzz');
        expect(mount().displayKeys).toEqual([]);
    });

    it('resetListState clears the query and restores the popularity sort', () => {
        const result = mount();
        result.setSearchQuery('ALICE');
        result.handleAlphabeticalPress();
        result.resetListState();

        const reset = mount();
        expect(reset.searchQuery).toBe('');
        expect(reset.popularityActive).toBe(true);
        expect(reset.displayKeys.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);
    });
});

describe('useKeySelectionList derived presentation state', () => {
    it('reflects the active sort and direction in the exposed flags', () => {
        const initial = mount();
        expect(initial.popularityActive).toBe(true);
        expect(initial.alphabeticalActive).toBe(false);
        expect(initial.alphabeticalDirection).toBe('asc');
        expect(initial.alphabeticalArrowIcon).toBe('arrow-upward');

        initial.handleAlphabeticalPress();
        const alphabetical = mount();
        expect(alphabetical.popularityActive).toBe(false);
        expect(alphabetical.alphabeticalActive).toBe(true);
        expect(alphabetical.alphabeticalArrowIcon).toBe('arrow-upward');

        alphabetical.handleAlphabeticalPress();
        expect(mount().alphabeticalDirection).toBe('desc');
        expect(mount().alphabeticalArrowIcon).toBe('arrow-downward');
    });

    it('exposes the active/inactive sort pill colors', () => {
        const result = mount();
        expect(result.popularityColor).toBe(theme.colors.onPrimary);
        expect(result.alphabeticalColor).toBe(theme.colors.textSecondary);
    });
});
