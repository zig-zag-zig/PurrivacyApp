import { describe, expect, it } from 'vitest';

import {
    resolveAdditionalKeyboardSpacer,
    resolveKeyboardAwareScrollY,
} from './keyboardAwareScroll';

const baseParams = {
    currentScrollY: 120,
    inputBottom: 420,
    inputTop: 370,
    visibleBottom: 700,
    visibleTop: 60,
};

describe('resolveKeyboardAwareScrollY', () => {
    it('does not scroll when the focused field is already visible', () => {
        expect(resolveKeyboardAwareScrollY(baseParams)).toBe(120);
    });

    it('scrolls down just enough when the focused field is behind the keyboard', () => {
        expect(resolveKeyboardAwareScrollY({
            ...baseParams,
            inputBottom: 760,
        })).toBe(180);
    });

    it('scrolls up when the focused field is hidden behind the top safe area', () => {
        expect(resolveKeyboardAwareScrollY({
            ...baseParams,
            inputTop: 32,
        })).toBe(92);
    });

    it('clamps upward scrolling at zero', () => {
        expect(resolveKeyboardAwareScrollY({
            ...baseParams,
            currentScrollY: 12,
            inputTop: 20,
        })).toBe(0);
    });
});

describe('resolveAdditionalKeyboardSpacer', () => {
    it('adds nothing when existing content can reach the target scroll position', () => {
        expect(resolveAdditionalKeyboardSpacer({
            contentHeight: 900,
            targetScrollY: 180,
            viewportHeight: 700,
        })).toBe(0);
    });

    it('adds only the missing scroll range when content is shorter than the viewport', () => {
        expect(resolveAdditionalKeyboardSpacer({
            contentHeight: 600,
            targetScrollY: 180,
            viewportHeight: 700,
        })).toBe(180);
    });

    it('accounts for scroll range that already exists', () => {
        expect(resolveAdditionalKeyboardSpacer({
            contentHeight: 780,
            targetScrollY: 180,
            viewportHeight: 700,
        })).toBe(100);
    });
});
