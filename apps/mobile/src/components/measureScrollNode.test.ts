import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Dimensions: {
        get: () => ({ width: 400, height: 800 }),
    },
}));

import { measureScrollNodeInWindow } from './measureScrollNode';

describe('measureScrollNodeInWindow', () => {
    it('prefers the native host ref when the component ref cannot measure itself', () => {
        const nativeMeasure = vi.fn();
        const scrollView = {
            getNativeScrollRef: () => ({ measureInWindow: nativeMeasure }),
        };
        const flatList = {
            getScrollRef: () => scrollView,
        };

        measureScrollNodeInWindow(flatList, vi.fn());

        expect(nativeMeasure).toHaveBeenCalledTimes(1);
    });

    it('uses the component ref when it implements measureInWindow', () => {
        const measure = vi.fn();
        measureScrollNodeInWindow({ measureInWindow: measure }, vi.fn());
        expect(measure).toHaveBeenCalledTimes(1);
    });

    it('falls back to the window when no ref can measure', () => {
        const callback = vi.fn();
        measureScrollNodeInWindow({}, callback);
        expect(callback).toHaveBeenCalledWith(0, 0, 400, 800);
    });

    it('falls back to the window when measuring throws', () => {
        const callback = vi.fn();
        measureScrollNodeInWindow({
            measureInWindow: () => {
                throw new Error('not a native view');
            },
        }, callback);
        expect(callback).toHaveBeenCalledWith(0, 0, 400, 800);
    });
});