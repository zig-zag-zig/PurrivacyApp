/**
 * Deterministic TOTP box editing (positional model).
 *
 * The hidden numeric input's caret is not reliable as an edit target (the
 * boxes are the visual caret), so edits are computed from the text diff and
 * applied to the box the user tapped. Boxes are positional: digits stay in
 * their box and are never shifted, so a deleted digit leaves its box empty.
 *
 * - Typing writes the digit INTO the tapped box (replacing any digit there),
 *   then advances to the next box.
 * - Backspace on a filled box empties it and stays there.
 * - Backspace on an empty box empties the box before it and moves there.
 * - Backspace when both are empty moves one box back without deleting.
 * - Larger diffs (autofill/paste through onChangeText) replace from the start.
 */

export const TOTP_LENGTH = 6;

export type TotpEditResult = {
    code: string[];
    activeIndex: number;
};

const clampIndex = (index: number): number => (
    Math.min(Math.max(index, 0), TOTP_LENGTH - 1)
);

const findFirstDiffIndex = (prev: string, next: string): number => {
    let index = 0;
    while (index < prev.length && prev[index] === next[index]) {
        index += 1;
    }
    return index;
};

export const applyTotpEdit = (
    previous: string[],
    nextText: string,
    activeIndex: number,
): TotpEditResult => {
    const prev = previous.join('');
    const next = nextText.replace(/[^0-9]/g, '').slice(0, TOTP_LENGTH);
    const code = [...previous];

    if (next.length === prev.length) {
        // No net change (e.g. a filtered keystroke).
        return { code, activeIndex };
    }

    if (next.length - prev.length > 1) {
        // Multi-character change (autofill/paste): replace from the start.
        const digits = next.split('');
        const replaced = Array(TOTP_LENGTH).fill('');
        digits.forEach((digit, index) => {
            replaced[index] = digit;
        });
        return {
            code: replaced,
            activeIndex: Math.min(digits.length, TOTP_LENGTH - 1),
        };
    }

    if (next.length > prev.length) {
        // Insert: extract the typed digit and write it into the tapped box.
        const diff = findFirstDiffIndex(prev, next);
        const digit = next[diff] ?? '';
        const index = clampIndex(activeIndex);

        code[index] = digit;
        return { code, activeIndex: Math.min(index + 1, TOTP_LENGTH - 1) };
    }

    // Delete (positional, no shifting):
    const index = clampIndex(activeIndex);
    if (code[index]) {
        // Empty the tapped box and stay in it.
        code[index] = '';
        return { code, activeIndex: index };
    }
    if (index > 0 && code[index - 1]) {
        // Empty the box before the tapped one and move into it.
        code[index - 1] = '';
        return { code, activeIndex: index - 1 };
    }
    if (index > 0) {
        // Both empty: move one box back without deleting.
        return { code, activeIndex: index - 1 };
    }
    return { code, activeIndex: 0 };
};
