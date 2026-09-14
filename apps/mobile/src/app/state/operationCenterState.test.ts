import { describe, expect, it } from 'vitest';

import {
    countRunning,
    countUnseenFinished,
    latestByKind,
    newOperationId,
    operationCenterReducer,
    pruneOperations,
    MAX_FINISHED_OPERATIONS,
    type OperationRecord,
} from './operationCenterState';

const makeRecord = (overrides: Partial<OperationRecord> = {}): OperationRecord => ({
    id: overrides.id ?? newOperationId('generic'),
    kind: 'file-encrypt',
    title: 'Encrypting file',
    startedAt: Date.now(),
    status: 'running',
    ...overrides,
});

describe('operationCenterState', () => {
    it('started inserts newest first and rejects duplicate ids', () => {
        const a = makeRecord({ id: 'a' });
        const b = makeRecord({ id: 'b' });
        let state = operationCenterReducer({ operations: [] }, { type: 'started', record: a });
        state = operationCenterReducer(state, { type: 'started', record: b });
        expect(state.operations.map(op => op.id)).toEqual(['b', 'a']);

        const again = operationCenterReducer(state, { type: 'started', record: b });
        expect(again).toBe(state);
    });

    it('updated patches only the target record', () => {
        const a = makeRecord({ id: 'a' });
        const b = makeRecord({ id: 'b' });
        const state = operationCenterReducer(
            { operations: [a, b] },
            { type: 'updated', id: 'a', patch: { status: 'succeeded', finishedAt: 1, resultSummary: 'done' } },
        );
        expect(state.operations[0].status).toBe('succeeded');
        expect(state.operations[1].status).toBe('running');
    });

    it('dismiss removes only finished records', () => {
        const running = makeRecord({ id: 'running', status: 'running' });
        const finished = makeRecord({ id: 'finished', status: 'failed' });
        let state = operationCenterReducer(
            { operations: [running, finished] },
            { type: 'dismiss', id: 'finished' },
        );
        expect(state.operations.map(op => op.id)).toEqual(['running']);

        // Dismissing a running record is a no-op.
        state = operationCenterReducer(state, { type: 'dismiss', id: 'running' });
        expect(state.operations.map(op => op.id)).toEqual(['running']);
    });

    it('clearFinished keeps running records', () => {
        const running = makeRecord({ id: 'running', status: 'running' });
        const finished = makeRecord({ id: 'finished', status: 'succeeded' });
        const state = operationCenterReducer(
            { operations: [finished, running] },
            { type: 'clearFinished' },
        );
        expect(state.operations.map(op => op.id)).toEqual(['running']);
    });

    it('pruneOperations caps finished records and keeps running ones', () => {
        const running = makeRecord({ id: 'running', status: 'running' });
        const finished = Array.from({ length: MAX_FINISHED_OPERATIONS + 3 }, (_, i) =>
            makeRecord({ id: `f${i}`, status: 'succeeded' }),
        );
        const pruned = pruneOperations([running, ...finished]);
        const ids = pruned.map(op => op.id);
        expect(ids).toContain('running');
        expect(pruned.filter(op => op.status !== 'running')).toHaveLength(MAX_FINISHED_OPERATIONS);
        // Newest finished survive (records were newest-first, f0 newest).
        expect(ids).toContain('f0');
        expect(ids).not.toContain(`f${MAX_FINISHED_OPERATIONS + 2}`);
    });

    it('latestByKind and counters', () => {
        const ops = [
            makeRecord({ id: '1', kind: 'file-decrypt', status: 'running' }),
            makeRecord({ id: '2', kind: 'file-encrypt', status: 'succeeded' }),
            makeRecord({ id: '3', kind: 'file-encrypt', status: 'failed', seen: true }),
        ];
        expect(latestByKind(ops, 'file-encrypt')?.id).toBe('2');
        expect(latestByKind(ops, 'key-generate')).toBeUndefined();
        expect(countRunning(ops)).toBe(1);
        expect(countUnseenFinished(ops)).toBe(1);
    });

    it('newOperationId is unique', () => {
        const ids = new Set(Array.from({ length: 100 }, () => newOperationId('generic')));
        expect(ids.size).toBe(100);
    });
});
