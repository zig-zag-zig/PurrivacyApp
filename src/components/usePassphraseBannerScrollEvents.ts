import { useRef } from 'react';
import type {
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollViewProps,
} from 'react-native';

import {
    requestPassphraseBannerDismiss,
    requestPassphraseBannerReposition,
} from '../services/passphraseBannerEvents';

type TouchHandler = NonNullable<ScrollViewProps['onTouchStart']>;
type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

type UsePassphraseBannerScrollEventsParams = {
    onScroll?: ScrollHandler;
    onTouchEnd?: ScrollViewProps['onTouchEnd'];
    onTouchMove?: ScrollViewProps['onTouchMove'];
    onTouchStart?: ScrollViewProps['onTouchStart'];
};

export function usePassphraseBannerScrollEvents({
    onScroll,
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
            if (deltaX > 8 || deltaY > 8) {
                touchMovedRef.current = true;
            }
        }
        onTouchMove?.(event);
    };

    const handleTouchEnd: TouchHandler = event => {
        if (!touchMovedRef.current) {
            requestPassphraseBannerDismiss();
        }
        touchStartRef.current = null;
        touchMovedRef.current = false;
        onTouchEnd?.(event);
    };

    return {
        handleScroll,
        handleTouchEnd,
        handleTouchMove,
        handleTouchStart,
    };
}
