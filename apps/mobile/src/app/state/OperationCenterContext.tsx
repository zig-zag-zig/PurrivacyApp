import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
} from 'react';
import { AppState } from 'react-native';

import {
    countRunning,
    countUnseenFinished,
    formatBytes,
    latestByKind,
    newOperationId,
    prunedOperationCenterReducer,
    initialOperationCenterState,
    removedOperationFileUris,
    type OperationKind,
    type OperationRecord,
} from './operationCenterState';
import {
    startOperationKeepAlive,
    stopOperationKeepAlive,
    updateOperationKeepAlive,
} from '../../services/operationKeepAlive';
import {
    armOperationLockGrace,
    clearOperationLockGrace,
    setActiveOperationCount,
} from '../../services/operationRuntimeState';
import { logger } from '../../utils/logger';
import { deleteCachedFile } from '../../services/fileCacheCleanup';

/**
 * App-wide registry for long-running operations (file encrypt/decrypt, key
 * generation, …). The provider owns each operation's async work, so it
 * continues regardless of navigation and its outcome stays visible and
 * restorable:
 *
 *  - Screens call `beginOperation` instead of owning the busy/result state
 *    for long ops. The `run` callback receives an api to report phase and
 *    progress and to settle the record; it must not reference component
 *    state or setters (the closure outlives the screen).
 *  - `useLatestOperation(kind)` lets a screen restore a result after
 *    remount (e.g. returning to the Encrypt tab).
 *  - A compact status surface (rendered by `OperationCenterUI`) keeps
 *    pending/finished operations visible from anywhere — no blocking
 *    full-screen spinner for these ops.
 *  - AppState changes do not cancel operations, but Android may suspend the
 *    WebView renderer while the app is backgrounded: crypto work can stall and
 *    resume only when the app is foregrounded again. The native keep-alive
 *    service keeps the process (and the operation record) alive and the bounded
 *    lock grace delays the inactivity lock, but neither guarantees that WebView
 *    work progresses in the background. If the OS kills the process, the
 *    registry dies with it — surfaced honestly as "nothing running" on next
 *    launch rather than a fake resume.
 */

export interface OperationRunApi {
    /** Update the current phase label (e.g. "Streaming ciphertext"). */
    setPhase: (phase: string) => void;
    /** Report progress units (bytes for file ops). */
    setProgress: (done: number, total?: number) => void;
    /** Mark the operation successful and attach a restorable payload. */
    succeed: (result?: Record<string, unknown>, resultSummary?: string) => void;
}

export interface BeginOperationInput<T = void> {
    kind: OperationKind;
    title: string;
    detail?: string;
    /**
     * The operation itself. Resolving normally (after calling
     * `api.succeed`) records success; throwing records failure and
     * rethrows so the caller keeps its existing error handling. The
     * resolved value is returned by `beginOperation` to the caller.
     */
    run: (api: OperationRunApi) => Promise<T>;
}

interface OperationCenterContextValue {
    operations: OperationRecord[];
    runningCount: number;
    unseenFinishedCount: number;
    beginOperation: <T>(input: BeginOperationInput<T>, expectedEpoch?: number) => Promise<T>;
    getOperationEpoch: () => number;
    failRunningOperations: (reason: string) => void;
    /** Unblock new operations after the vault is unlocked again. */
    resumeOperations: () => void;
    markSeen: (id: string) => void;
    dismiss: (id: string) => void;
    clearFinished: () => void;
}

const OperationCenterContext = createContext<OperationCenterContextValue | null>(null);

const OP_NOTIFICATION_ID_PREFIX = 'purrivacy-op-';

/** Upper bound on foreground-service notification refreshes. Progress updates
 * arrive once per streamed chunk; the notification only needs a coarse rate. */
const KEEP_ALIVE_UPDATE_INTERVAL_MS = 2000;

/** Best-effort local notification when an operation finishes in background. */
const notifyFinishedInBackground = async (record: OperationRecord): Promise<void> => {
    try {
        // Imported lazily so the notification module (and its native/expo
        // runtime requirements) is not pulled into every importer of the
        // operation center — e.g. unit tests that only exercise the reducer.
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        await Notifications.scheduleNotificationAsync({
            content: {
                title: record.title,
                // Never include file names, result summaries, or raw error
                // strings: this notification is displayed on the lock screen
                // and can be read by notification-listener services.
                body: record.status === 'succeeded' ? 'Operation finished' : 'Operation failed',
            },
            trigger: null, // fire immediately
            identifier: `${OP_NOTIFICATION_ID_PREFIX}${record.id}`,
        });
    } catch (error) {
        logger.warn('operation notification failed', { error });
    }
};

const describeKeepAliveStatus = (running: OperationRecord[]): { title: string; detail: string } => {
    const primary = running[0];
    const title = running.length === 1
        ? primary.title
        : `${running.length} operations running`;
    const progressText = primary?.progress
        ? primary.progress.total && primary.progress.total > 0
            ? `${formatBytes(primary.progress.done)} / ${formatBytes(primary.progress.total)}`
            : formatBytes(primary.progress.done)
        : undefined;
    // Deliberately excludes `record.detail` (file names, recipient/user ids):
    // this text is rendered on the lock screen by the foreground-service
    // notification. Only generic phase/progress information belongs here.
    const detail = [primary?.phase, progressText]
        .filter(Boolean)
        .join(' · ') || 'Keep Purrivacy open to continue';
    return { title, detail };
};

export const OperationCenterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(prunedOperationCenterReducer, initialOperationCenterState);
    const appStateRef = useRef(AppState.currentState);
    const keepAliveActiveRef = useRef(false);
    const lastKeepAlivePayloadRef = useRef<string | null>(null);
    const lastKeepAliveUpdateAtRef = useRef(0);
    const previousOperationsRef = useRef<OperationRecord[]>([]);
    const operationsRef = useRef<OperationRecord[]>(state.operations);
    operationsRef.current = state.operations;
    const operationsSuspendedRef = useRef(false);
    const operationEpochRef = useRef(0);

    // When a record leaves the registry (dismissed, cleared, or pruned by the
    // finished-record cap), delete its cached output file. Downloads copies are
    // content:// URIs and are intentionally untouched.
    useEffect(() => {
        for (const fileUri of removedOperationFileUris(previousOperationsRef.current, state.operations)) {
            deleteCachedFile(fileUri);
        }
        previousOperationsRef.current = state.operations;
    }, [state.operations]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            appStateRef.current = nextAppState;
            // The bounded lock-deferral window is measured from the moment the
            // app leaves the foreground with work still running, so a long
            // foreground run never eats into (or shortens) it.
            if (nextAppState === 'active') {
                clearOperationLockGrace();
            } else {
                armOperationLockGrace();
            }
        });
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        const running = state.operations.filter(op => op.status === 'running');
        setActiveOperationCount(running.length);

        if (running.length === 0) {
            lastKeepAlivePayloadRef.current = null;
            lastKeepAliveUpdateAtRef.current = 0;
            clearOperationLockGrace();
            if (keepAliveActiveRef.current) {
                keepAliveActiveRef.current = false;
                void stopOperationKeepAlive();
            }
            return;
        }

        const { title, detail } = describeKeepAliveStatus(running);
        const payload = `${title}\u0000${detail}`;
        const now = Date.now();
        if (keepAliveActiveRef.current) {
            if (payload === lastKeepAlivePayloadRef.current) return;
            if (now - lastKeepAliveUpdateAtRef.current < KEEP_ALIVE_UPDATE_INTERVAL_MS) return;
        }

        lastKeepAlivePayloadRef.current = payload;
        lastKeepAliveUpdateAtRef.current = now;
        if (!keepAliveActiveRef.current) {
            keepAliveActiveRef.current = true;
            void startOperationKeepAlive(title, detail);
        } else {
            void updateOperationKeepAlive(title, detail);
        }
    }, [state.operations]);

    useEffect(() => () => {
        setActiveOperationCount(0);
        clearOperationLockGrace();
        if (keepAliveActiveRef.current) {
            keepAliveActiveRef.current = false;
            void stopOperationKeepAlive();
        }
    }, []);

    const beginOperation = useCallback(async <T,>(input: BeginOperationInput<T>, expectedEpoch?: number): Promise<T> => {
        if (operationsSuspendedRef.current || (expectedEpoch !== undefined && expectedEpoch !== operationEpochRef.current)) {
            // A batch loop can outlive the screen that started it. Without this
            // guard, files queued before a lock/sign-out would keep running and
            // could repopulate the operation registry with decrypted results
            // after it was cleared.
            throw new Error('Operations are paused while the vault is locked or signed out');
        }
        const operationEpoch = operationEpochRef.current;
        const id = newOperationId(input.kind);
        const record: OperationRecord = {
            id,
            kind: input.kind,
            title: input.title,
            detail: input.detail,
            startedAt: Date.now(),
            status: 'running',
        };
        dispatch({ type: 'started', record });

        let settled = false;
        const isCurrentOperation = () => (
            !operationsSuspendedRef.current && operationEpoch === operationEpochRef.current
        );
        const patch = (p: Partial<OperationRecord>) => {
            if (!isCurrentOperation()) return;
            dispatch({ type: 'updated', id, patch: p });
        };
        const api: OperationRunApi = {
            setPhase: phase => patch({ phase }),
            setProgress: (done, total) => patch({ progress: { done, total } }),
            succeed: (result, resultSummary) => {
                if (!isCurrentOperation()) {
                    const fileUri = typeof result?.fileUri === 'string' ? result.fileUri : null;
                    deleteCachedFile(fileUri);
                    return;
                }
                settled = true;
                patch({
                    status: 'succeeded',
                    finishedAt: Date.now(),
                    result,
                    resultSummary,
                    phase: undefined,
                });
            },
        };

        try {
            const value = await input.run(api);
            if (!isCurrentOperation()) {
                // Do not let a late decrypt/encrypt result escape to a screen
                // after lock/sign-out/account-switch. The caller will receive
                // an interruption error instead of dispatching sensitive data.
                throw new Error('Operation interrupted because the vault locked or signed out');
            }
            if (!settled) {
                // Run resolved without an explicit succeed — record success
                // anyway so the registry never shows a phantom running op.
                patch({ status: 'succeeded', finishedAt: Date.now(), phase: undefined });
            }
            if (isCurrentOperation() && appStateRef.current.match(/inactive|background/)) {
                void notifyFinishedInBackground({
                    ...record,
                    status: 'succeeded',
                });
            }
            return value;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patch({ status: 'failed', finishedAt: Date.now(), phase: undefined, error: message });
            if (isCurrentOperation() && appStateRef.current.match(/inactive|background/)) {
                void notifyFinishedInBackground({
                    ...record,
                    status: 'failed',
                    error: message,
                });
            }
            throw error;
        }
    }, []);

    const getOperationEpoch = useCallback(() => operationEpochRef.current, []);
    const failRunningOperations = useCallback((reason: string) => {
        operationEpochRef.current += 1;
        operationsSuspendedRef.current = true;
        dispatch({ type: 'failRunning', error: reason });
    }, []);
    const resumeOperations = useCallback(() => {
        operationsSuspendedRef.current = false;
    }, []);
    const markSeen = useCallback((id: string) => dispatch({ type: 'seen', id }), []);
    const dismiss = useCallback((id: string) => {
        const operation = operationsRef.current.find(candidate => candidate.id === id);
        if (operation?.status !== 'running') {
            const fileUri = typeof operation?.result?.fileUri === 'string' ? operation.result.fileUri : null;
            deleteCachedFile(fileUri);
        }
        dispatch({ type: 'dismiss', id });
    }, []);
    const clearFinished = useCallback(() => {
        for (const operation of operationsRef.current) {
            if (operation.status !== 'running') {
                const fileUri = typeof operation.result?.fileUri === 'string' ? operation.result.fileUri : null;
                deleteCachedFile(fileUri);
            }
        }
        dispatch({ type: 'clearFinished' });
    }, []);

    const value = useMemo<OperationCenterContextValue>(() => ({
        operations: state.operations,
        runningCount: countRunning(state.operations),
        unseenFinishedCount: countUnseenFinished(state.operations),
        beginOperation,
        getOperationEpoch,
        failRunningOperations,
        resumeOperations,
        markSeen,
        dismiss,
        clearFinished,
    }), [state.operations, beginOperation, getOperationEpoch, failRunningOperations, resumeOperations, markSeen, dismiss, clearFinished]);

    return (
        <OperationCenterContext.Provider value={value}>
            {children}
        </OperationCenterContext.Provider>
    );
};

export const useOperationCenter = (): OperationCenterContextValue => {
    const context = useContext(OperationCenterContext);
    if (!context) {
        throw new Error('useOperationCenter must be used within OperationCenterProvider');
    }
    return context;
};

/** Latest record of a kind — screens use it to restore progress/results. */
export const useLatestOperation = (kind: OperationKind): OperationRecord | undefined => {
    const { operations } = useOperationCenter();
    return latestByKind(operations, kind);
};
