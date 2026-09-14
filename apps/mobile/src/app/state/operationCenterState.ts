/**
 * Pure state for the app-wide operation center — the registry of long-running
 * operations (file encrypt/decrypt, key generation, …) that must survive
 * screen navigation and app backgrounding.
 *
 * The center, not the screen, owns an operation's lifecycle: the async work is
 * started by `beginOperation` outside any component lifetime, so navigating
 * away mid-operation can neither cancel it nor lose its outcome. Screens read
 * records back via `latestByKind` to restore progress/results on remount.
 */

export type OperationKind =
    | 'file-encrypt'
    | 'file-decrypt'
    | 'text-encrypt'
    | 'text-decrypt'
    | 'key-generate'
    | 'key-import'
    | 'key-revoke'
    | 'generic';

export type OperationStatus = 'running' | 'succeeded' | 'failed';

export interface OperationProgress {
    /** Units completed (bytes for file ops). */
    done: number;
    /** Total units when known. */
    total?: number;
}

export interface OperationRecord {
    id: string;
    kind: OperationKind;
    /** Short human title, e.g. "Encrypting file". */
    title: string;
    /** What it acts on, e.g. the file name. */
    detail?: string;
    startedAt: number;
    finishedAt?: number;
    status: OperationStatus;
    /** Current phase label, e.g. "Streaming ciphertext". */
    phase?: string;
    progress?: OperationProgress;
    /**
     * Serializable result payload for screen restore (e.g. the encrypt
     * output card). Only plain JSON-safe data belongs here.
     */
    result?: Record<string, unknown>;
    /** Short user-facing success summary, e.g. "song.pgp · 4.2 MB". */
    resultSummary?: string;
    /** User-facing failure message. */
    error?: string;
    /** Set once the user has seen a finished record (badge logic). */
    seen?: boolean;
}

export interface OperationCenterState {
    /** Newest first. */
    operations: OperationRecord[];
}

export type OperationCenterAction =
    | { type: 'started'; record: OperationRecord }
    | { type: 'updated'; id: string; patch: Partial<OperationRecord> }
    | { type: 'seen'; id: string }
    | { type: 'dismiss'; id: string }
    | { type: 'clearFinished' };

/** Keep the newest N finished records; running records are never pruned. */
export const MAX_FINISHED_OPERATIONS = 10;

let nextOperationId = 0;
export const newOperationId = (kind: OperationKind): string => {
    nextOperationId += 1;
    return `op-${kind}-${Date.now().toString(36)}-${nextOperationId}`;
};

export const initialOperationCenterState: OperationCenterState = {
    operations: [],
};

const isFinished = (op: OperationRecord): boolean => op.status !== 'running';

export function operationCenterReducer(
    state: OperationCenterState,
    action: OperationCenterAction,
): OperationCenterState {
    switch (action.type) {
        case 'started':
            // Newest first; guard against duplicate ids (defensive).
            if (state.operations.some(op => op.id === action.record.id)) return state;
            return { operations: [action.record, ...state.operations] };

        case 'updated':
            return {
                operations: state.operations.map(op =>
                    op.id === action.id ? { ...op, ...action.patch } : op,
                ),
            };

        case 'seen':
            return {
                operations: state.operations.map(op =>
                    op.id === action.id ? { ...op, seen: true } : op,
                ),
            };

        case 'dismiss':
            return {
                operations: state.operations.filter(
                    op => op.id !== action.id || !isFinished(op),
                ),
            };

        case 'clearFinished':
            return { operations: state.operations.filter(op => !isFinished(op)) };

        default:
            return state;
    }
}

/** Enforce the finished-record cap (running records survive). */
export function pruneOperations(operations: OperationRecord[]): OperationRecord[] {
    const finished = operations.filter(isFinished);
    if (finished.length <= MAX_FINISHED_OPERATIONS) return operations;
    const kept = new Set(finished.slice(0, MAX_FINISHED_OPERATIONS).map(op => op.id));
    return operations.filter(op => !isFinished(op) || kept.has(op.id));
}

export const latestByKind = (
    operations: OperationRecord[],
    kind: OperationKind,
): OperationRecord | undefined => operations.find(op => op.kind === kind);

export const countRunning = (operations: OperationRecord[]): number =>
    operations.filter(op => op.status === 'running').length;

/** Finished records the user has not seen yet (badge on the status bar). */
export const countUnseenFinished = (operations: OperationRecord[]): number =>
    operations.filter(op => isFinished(op) && !op.seen).length;

/** Format bytes for status surfaces. */
export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Reducer with the finished-record cap applied on every action. */
export function prunedOperationCenterReducer(
    state: OperationCenterState,
    action: OperationCenterAction,
): OperationCenterState {
    return { operations: pruneOperations(operationCenterReducer(state, action).operations) };
}
