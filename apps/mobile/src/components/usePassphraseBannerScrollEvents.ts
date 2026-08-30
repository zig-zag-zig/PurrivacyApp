import { useRef } from 'react';
import {
    Keyboard,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    type ScrollViewProps,
} from 'react-native';

import {
    requestPassphraseBannerDismiss,
    requestPassphraseBannerReposition,
} from '../services/passphraseBannerEvents';
import { blurAllIsolatedInputs } from './IsolatedTextInput';

type TouchHandler = NonNullable<ScrollViewProps['onTouchStart']>;
type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

type UsePassphraseBannerScrollEventsParams = {
    onScroll?: ScrollHandler;
    onScrollBeginDrag?: ScrollHandler;
    onTouchEnd?: ScrollViewProps['onTouchEnd'];
    onTouchMove?: ScrollViewProps['onTouchMove'];
    onTouchStart?: ScrollViewProps['onTouchStart'];
};

export function usePassphraseBannerScrollEvents({
    onScroll,
    onScrollBeginDrag,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
}: UsePassphraseBannerScrollEventsParams) {
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const touchMovedRef = useRef(false);

    const handleScroll: ScrollHandler = event => {
        requestPassphraseBannerReposition();
        onScroll?.(event);
    };

    const handleScrollBeginDrag: ScrollHandler = event => {
        // Dismiss the banner ONLY on user-initiated scrolls.
        // Programmatic scrolls (like keyboard avoidance) do NOT trigger this event.
        requestPassphraseBannerDismiss();
        onScrollBeginDrag?.(event);
    };

    const handleTouchStart: TouchHandler = event => {
        touchMovedRef.current = false;
        touchStartRef.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
        };
        onTouchStart?.(event);
    };

    const handleTouchMove: TouchHandler = event => {
        const start = touchStartRef.current;
        if (start) {
            const deltaX = Math.abs(event.nativeEvent.pageX - start.x);
            const deltaY = Math.abs(event.nativeEvent.pageY - start.y);
            // When the user initiates a scroll (>8px movement), dismiss the
            // banner immediately. This only fires once per gesture (guarded
            // by !touchMovedRef.current). Keyboard-induced scrolls don't
            // trigger handleTouchMove, so the banner stays visible then.
            if (!touchMovedRef.current && (deltaX > 8 || deltaY > 8)) {
                touchMovedRef.current = true;
                requestPassphraseBannerDismiss();
            }
        }
        onTouchMove?.(event);
    };

    const handleTouchEnd: TouchHandler = event => {
        if (!touchMovedRef.current) {
            requestPassphraseBannerDismiss();
            // Blur all focused isolated inputs. This bypasses TextInput.State
            // (which doesn't track requireNativeComponent views) and directly
            // dispatches the blur command to each focused isolated input.
            blurAllIsolatedInputs();
        }
        touchStartRef.current = null;
        touchMovedRef.current = false;
        onTouchEnd?.(event);
    };

    return {
        handleScroll,
        handleScrollBeginDrag,
        handleTouchEnd,
        handleTouchMove,
        handleTouchStart,
    };
}