import { createLogger } from '../../utils/logger';

const logger = createLogger('core.transitions');

/**
 * Generic runner for ordered, named, retryable state transitions (API-SEC-008).
 *
 * A transition is a sequence of named steps. Each step must be idempotent or
 * guarded so that re-running it after a partial failure is safe. When a
 * progress store is provided, completed steps and their results are persisted
 * between attempts, so a retried request resumes exactly where the previous
 * attempt stopped instead of re-executing steps (and their side effects).
 *
 * The runner never throws for a failing step: it returns a structured outcome
 * describing which steps completed and which step failed, so the caller can
 * decide how to surface the failure (preserve the original client-facing
 * error, run compensation, or raise a retryable transition error).
 */

export interface TransitionStep {
    name: string;
    run: () => Promise<unknown>;
}

export interface TransitionProgress {
    steps: Record<string, { completedAt: string; result?: unknown }>;
    expiresAt: number;
}

export interface TransitionStore {
    read(): Promise<TransitionProgress | null>;
    complete(stepName: string, result?: unknown): Promise<void>;
    clear(): Promise<void>;
}

interface TransitionExecution {
    status: 'completed' | 'failed';
    completedSteps: string[];
    failedStep?: string;
    error?: unknown;
    /**
     * Results of every completed step, sourced from the current run or from
     * the persisted progress of a previous attempt.
     */
    results: Record<string, unknown>;
}

export const executeTransition = async (
    steps: TransitionStep[],
    options: { store?: TransitionStore } = {},
): Promise<TransitionExecution> => {
    const { store } = options;
    const completedSteps: string[] = [];
    const results: Record<string, unknown> = {};

    if (store) {
        const progress = await store.read();
        if (progress) {
            for (const [name, step] of Object.entries(progress.steps)) {
                if (step) {
                    completedSteps.push(name);
                    if (step.result !== undefined) {
                        results[name] = step.result;
                    }
                }
            }
        }
    }

    for (const step of steps) {
        if (completedSteps.includes(step.name)) {
            continue;
        }

        try {
            const result = await step.run();
            results[step.name] = result;
            completedSteps.push(step.name);
            if (store) {
                await store.complete(step.name, result);
            }
        } catch (error) {
            return {
                status: 'failed',
                completedSteps: [...completedSteps],
                failedStep: step.name,
                error,
                results,
            };
        }
    }

    if (store) {
        try {
            await store.clear();
        } catch (error) {
            // The progress document expires naturally (TTL); a failed cleanup
            // must not fail an otherwise completed transition.
            logger.warn('failed to clear transition progress', { error });
        }
    }

    return { status: 'completed', completedSteps: [...completedSteps], results };
};
