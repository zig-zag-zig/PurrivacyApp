import { Dimensions } from 'react-native';

export type MeasureInWindowCallback = (
    x: number,
    y: number,
    width: number,
    height: number,
) => void;

type MeasureNode = {
    measureInWindow?: (callback: MeasureInWindowCallback) => void;
};

type ScrollMeasureNode = MeasureNode & {
    getNativeScrollRef?: () => unknown;
    getScrollRef?: () => unknown;
};

const asMeasureNode = (value: unknown): MeasureNode | null => (
    value !== null && typeof value === 'object' ? value as MeasureNode : null
);

const asScrollNode = (value: unknown): ScrollMeasureNode | null => (
    value !== null && typeof value === 'object' ? value as ScrollMeasureNode : null
);

const fallbackToWindow = (callback: MeasureInWindowCallback): void => {
    const { width, height } = Dimensions.get('window');
    callback(0, 0, width, height);
};

/**
 * Measures a ScrollView/FlatList viewport in window coordinates.
 *
 * The component refs exposed by ScrollView/VirtualizedList do not always
 * implement `measureInWindow` themselves (notably under Fabric). Their native
 * host instance does. Try the host instance first, then the component ref, and
 * finally fall back to the full window so callers are never left waiting for a
 * callback that will not arrive.
 */
export const measureScrollNodeInWindow = (
    node: ScrollMeasureNode | null | undefined,
    callback: MeasureInWindowCallback,
): void => {
    if (!node) {
        fallbackToWindow(callback);
        return;
    }

    const scrollRef = asScrollNode(node.getScrollRef?.());
    const candidates: Array<MeasureNode | null> = [
        asMeasureNode(node.getNativeScrollRef?.()),
        asMeasureNode(scrollRef?.getNativeScrollRef?.()),
        scrollRef,
        asMeasureNode(node),
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate.measureInWindow === 'function') {
            try {
                candidate.measureInWindow(callback);
                return;
            } catch {
                // Try the next candidate (or the window fallback).
            }
        }
    }

    fallbackToWindow(callback);
};