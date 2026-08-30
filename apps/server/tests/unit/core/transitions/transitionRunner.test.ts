import { executeTransition, TransitionStore } from '../../../../src/core/transitions/transitionRunner';

const createStore = (): { store: TransitionStore; writes: string[] } => {
    const state: { steps: Record<string, { completedAt: string; result?: unknown }>; expiresAt: number } = {
        steps: {},
        expiresAt: Date.now() + 60_000,
    };
    const writes: string[] = [];
    return {
        writes,
        store: {
            async read() {
                return { steps: { ...state.steps }, expiresAt: state.expiresAt };
            },
            async complete(stepName, result) {
                state.steps[stepName] = {
                    completedAt: new Date().toISOString(),
                    ...(result !== undefined ? { result } : {}),
                };
                writes.push(stepName);
            },
            async clear() {
                state.steps = {};
                writes.push('clear');
            },
        },
    };
};

describe('executeTransition', () => {
    it('runs every step in order and collects results', async () => {
        const calls: string[] = [];
        const execution = await executeTransition([
            { name: 'a', run: async () => { calls.push('a'); return 'result-a'; } },
            { name: 'b', run: async () => { calls.push('b'); } },
        ]);

        expect(execution.status).toBe('completed');
        expect(calls).toEqual(['a', 'b']);
        expect(execution.completedSteps).toEqual(['a', 'b']);
        expect(execution.results).toEqual({ a: 'result-a', b: undefined });
    });

    it('persists completed steps and resumes from persisted progress', async () => {
        const { store } = createStore();
        const aCalls: string[] = [];
        const bCalls: string[] = [];
        const steps = [
            { name: 'a', run: async () => { aCalls.push('a'); return 'result-a'; } },
            { name: 'b', run: async () => { bCalls.push('b'); } },
        ];

        // First run fails at step b.
        const failing = [
            steps[0],
            { name: 'b', run: async () => { bCalls.push('b'); throw new Error('boom'); } },
        ];
        const first = await executeTransition(failing, { store });
        expect(first.status).toBe('failed');
        expect(first.failedStep).toBe('b');
        expect(first.completedSteps).toEqual(['a']);

        // Second run resumes: step a is skipped (and its result restored),
        // the failed step runs again.
        const second = await executeTransition(steps, { store });
        expect(second.status).toBe('completed');
        expect(aCalls).toEqual(['a']);
        expect(bCalls).toEqual(['b', 'b']);
        expect(second.results).toEqual({ a: 'result-a', b: undefined });
    });

    it('does not run later steps after a failure', async () => {
        const calls: string[] = [];
        const execution = await executeTransition([
            { name: 'a', run: async () => { calls.push('a'); throw new Error('boom'); } },
            { name: 'b', run: async () => { calls.push('b'); } },
        ]);

        expect(execution.status).toBe('failed');
        expect(execution.failedStep).toBe('a');
        expect(execution.completedSteps).toEqual([]);
        expect(calls).toEqual(['a']);
    });

    it('clears the store when every step completes', async () => {
        const { store, writes } = createStore();
        const execution = await executeTransition([
            { name: 'a', run: async () => undefined },
        ], { store });

        expect(execution.status).toBe('completed');
        expect(writes).toEqual(['a', 'clear']);
    });

    it('does not fail a completed transition when the store cleanup fails', async () => {
        const { store } = createStore();
        const failingClear = {
            ...store,
            clear: async () => { throw new Error('clear failed'); },
        };
        const execution = await executeTransition([
            { name: 'a', run: async () => undefined },
        ], { store: failingClear });

        expect(execution.status).toBe('completed');
    });

    it('fails the run when persisting a completed step fails (step stays counted in-memory)', async () => {
        const { store } = createStore();
        const failingComplete = {
            ...store,
            complete: async () => { throw new Error('complete failed'); },
        };
        const execution = await executeTransition([
            { name: 'a', run: async () => 'result-a' },
        ], { store: failingComplete });

        expect(execution.status).toBe('failed');
        expect(execution.failedStep).toBe('a');
        // The step itself succeeded; only its persistence failed, so the
        // in-memory progress still counts it as completed.
        expect(execution.completedSteps).toEqual(['a']);
    });
});
