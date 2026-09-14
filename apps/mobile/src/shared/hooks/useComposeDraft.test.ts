import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import React from 'react';

import {
    createDraftService,
    useComposeDraft,
    type DraftService,
    type DraftStore,
} from './useComposeDraft';

vi.mock('../../utils/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const makeFakeStore = () => {
    const map = new Map<string, string>();
    const store: DraftStore = {
        getItem: async key => map.get(key) ?? null,
        setItem: async (key, value) => { map.set(key, value); },
        removeItem: async key => { map.delete(key); },
    };
    return { store, map };
};

const flushMicrotasks = async () => {
    await act(async () => { await Promise.resolve(); });
};

describe('createDraftService', () => {
    let fake: ReturnType<typeof makeFakeStore>;
    let service: DraftService;

    beforeEach(() => {
        fake = makeFakeStore();
        service = createDraftService(fake.store);
    });

    it('saves and loads a draft namespaced per user and slot', async () => {
        await service.save('alice', 'encrypt', 'hello world');
        await service.save('bob', 'encrypt', 'bob draft');
        await service.save('alice', 'decrypt', 'alice cipher');

        expect(await service.load('alice', 'encrypt')).toBe('hello world');
        expect(await service.load('bob', 'encrypt')).toBe('bob draft');
        expect(await service.load('alice', 'decrypt')).toBe('alice cipher');
        expect(await service.load('alice', 'nope')).toBeNull();
    });

    it('saving an empty value clears the draft', async () => {
        await service.save('alice', 'encrypt', 'draft');
        await service.save('alice', 'encrypt', '   ');
        expect(await service.load('alice', 'encrypt')).toBeNull();
    });

    it('clear removes the draft', async () => {
        await service.save('alice', 'encrypt', 'draft');
        await service.clear('alice', 'encrypt');
        expect(await service.load('alice', 'encrypt')).toBeNull();
    });

    it('load failures resolve to null rather than throwing', async () => {
        const broken: DraftStore = {
            getItem: async () => { throw new Error('io'); },
            setItem: async () => { throw new Error('io'); },
            removeItem: async () => { throw new Error('io'); },
        };
        const svc = createDraftService(broken);
        await expect(svc.load('u', 's')).resolves.toBeNull();
        await expect(svc.save('u', 's', 'v')).resolves.toBeUndefined();
        await expect(svc.clear('u', 's')).resolves.toBeUndefined();
    });
});

describe('useComposeDraft', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const renderDraftHook = (props: {
        userId?: string;
        slot: string;
        value: string;
        service: DraftService;
        onRestore?: (v: string) => void;
        shouldClear?: boolean;
    }) => {
        let renderer: ReturnType<typeof create> | undefined;
        const Probe = () => {
            useComposeDraft({
                userId: props.userId,
                slot: props.slot,
                value: props.value,
                onRestore: props.onRestore ?? (() => {}),
                shouldClear: props.shouldClear,
                service: props.service,
            });
            return null;
        };
        act(() => {
            renderer = create(React.createElement(Probe));
        });
        return {
            renderer: () => renderer,
            update: (next: typeof props) => {
                props = next;
                act(() => { renderer!.update(React.createElement(Probe)); });
            },
        };
    };

    it('restores a stored draft once on mount', async () => {
        const { store, map } = makeFakeStore();
        map.set('draft:encrypt:u1', 'saved draft');
        const service = createDraftService(store);
        const onRestore = vi.fn();

        renderDraftHook({ slot: 'encrypt', value: '', userId: 'u1', service, onRestore });
        await flushMicrotasks();
        expect(onRestore).toHaveBeenCalledWith('saved draft');
    });

    it('does not restore over an already-typed value', async () => {
        const { store, map } = makeFakeStore();
        map.set('draft:encrypt:u1', 'saved draft');
        const service = createDraftService(store);
        const onRestore = vi.fn();

        renderDraftHook({ slot: 'encrypt', value: 'user already typed', userId: 'u1', service, onRestore });
        await flushMicrotasks();
        expect(onRestore).not.toHaveBeenCalled();
    });

    it('saves the value after the debounce window', async () => {
        const { store, map } = makeFakeStore();
        const service = createDraftService(store);

        renderDraftHook({ slot: 'encrypt', value: 'new text', userId: 'u1', service });
        await flushMicrotasks();
        await act(async () => { vi.advanceTimersByTime(700); });

        expect(map.get('draft:encrypt:u1')).toBe('new text');
    });

    it('clears the draft when shouldClear flips true', async () => {
        const { store, map } = makeFakeStore();
        map.set('draft:encrypt:u1', 'draft');
        const service = createDraftService(store);

        const h = renderDraftHook({ slot: 'encrypt', value: '', userId: 'u1', service, shouldClear: false });
        await flushMicrotasks();
        h.update({ slot: 'encrypt', value: '', userId: 'u1', service, shouldClear: true });
        await flushMicrotasks();

        expect(map.has('draft:encrypt:u1')).toBe(false);
    });
});
