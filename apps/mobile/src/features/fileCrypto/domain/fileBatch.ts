export interface FileBatchFailure<File> {
    file: File;
    index: number;
    error: unknown;
}

export interface FileBatchResult<File, Result> {
    /** Results of the files that succeeded, in completion order. */
    results: Result[];
    /** Files that failed, with their original index for retry filtering. */
    failures: FileBatchFailure<File>[];
}

/**
 * Runs one async job per file, sequentially.
 *
 * Sequential execution keeps a multi-file batch to one streaming crypto
 * session at a time (bounded memory/WebView load), and a failure is recorded
 * rather than thrown so one bad file cannot block the rest of the selection.
 * Callers can keep just the failures selected for an easy retry.
 */
export async function runFileBatch<File, Result>(
    files: readonly File[],
    run: (file: File, index: number) => Promise<Result>,
): Promise<FileBatchResult<File, Result>> {
    const results: Result[] = [];
    const failures: FileBatchFailure<File>[] = [];

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        try {
            results.push(await run(file, index));
        } catch (error) {
            failures.push({ file, index, error });
        }
    }

    return { results, failures };
}