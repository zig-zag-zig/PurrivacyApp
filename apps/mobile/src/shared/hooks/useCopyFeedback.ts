import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_COPY_FEEDBACK_MS = 1600;

export function useCopyFeedback(durationMs = DEFAULT_COPY_FEEDBACK_MS) {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearCopyFeedback = useCallback(() => {
        if (!timeoutRef.current) return;
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }, []);

    const markCopied = useCallback(() => {
        setCopied(true);
        clearCopyFeedback();
        timeoutRef.current = setTimeout(() => {
            setCopied(false);
            timeoutRef.current = null;
        }, durationMs);
    }, [clearCopyFeedback, durationMs]);

    useEffect(() => clearCopyFeedback, [clearCopyFeedback]);

    return {
        copied,
        markCopied,
    };
}
