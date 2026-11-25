import type {
    LayoutChangeEvent,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollViewProps,
} from 'react-native';

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
type LayoutHandler = NonNullable<ScrollViewProps['onLayout']>;
type ContentSizeHandler = NonNullable<ScrollViewProps['onContentSizeChange']>;

/**
 * The keyboard-aware scroll engine owns onScroll/onLayout/onContentSizeChange,
 * but more than one consumer needs to observe the same events: the engine's
 * own geometry, the scroll affordances and whatever the screen passed in.
 * These composers keep every listener attached so adding one never silently
 * replaces another.
 */
export const composeScrollHandlers = (
    ...handlers: Array<ScrollHandler | undefined>
): ScrollHandler => (event) => {
    for (const handler of handlers) handler?.(event);
};

export const composeLayoutHandlers = (
    ...handlers: Array<LayoutHandler | undefined>
): LayoutHandler => (event: LayoutChangeEvent) => {
    for (const handler of handlers) handler?.(event);
};

export const composeContentSizeHandlers = (
    ...handlers: Array<ContentSizeHandler | undefined>
): ContentSizeHandler => (width, height) => {
    for (const handler of handlers) handler?.(width, height);
};
