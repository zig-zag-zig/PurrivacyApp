/**
 * Failure-injection helpers for state-transition tests (API-SEC-008).
 *
 * These helpers make it possible to prove that a transition step fails at a
 * chosen invocation while every other invocation behaves normally, without
 * rewriting the step functions under test.
 */

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Wrap `fn` so it throws on the Nth invocation (1-based) and behaves
 * normally otherwise. `failures` may be a single call number or an array of
 * call numbers.
 */
export const failOnCall = <T extends AnyFn>(
    fn: T,
    failures: number | number[],
): T => {
    const failOn = new Set(Array.isArray(failures) ? failures : [failures]);
    let callCount = 0;
    return ((...args: unknown[]) => {
        callCount += 1;
        if (failOn.has(callCount)) {
            throw new Error(`injected failure on call ${callCount}`);
        }
        return (fn as AnyFn)(...args);
    }) as T;
};

export interface StepFunctionTarget {
    /** The object holding the step function (typically a mocked module namespace). */
    target: Record<string, unknown>;
    /** The step function's property name on `target`. */
    property: string;
}

/**
 * Apply a step-name-keyed failure map to step functions. Each map value is
 * the call number (or call numbers) on which that step's function throws;
 * steps not listed in the map keep their original behavior.
 *
 * The wrapped function replaces the original in place on its target object,
 * so the module under test observes the wrapper while the original mock
 * keeps recording invocations (assertions may still target the original
 * jest.fn reference).
 */
export const injectStepFailures = (
    steps: StepFunctionTarget[],
    failures: Partial<Record<string, number | number[]>>,
): void => {
    for (const { target, property } of steps) {
        const fn = target[property];
        const callNumbers = failures[property];
        if (typeof fn === 'function' && callNumbers !== undefined) {
            target[property] = failOnCall(fn as AnyFn, callNumbers);
        }
    }
};
