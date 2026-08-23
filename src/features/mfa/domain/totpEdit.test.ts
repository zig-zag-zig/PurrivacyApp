import { describe, expect, it } from 'vitest';
import { applyTotpEdit, TOTP_LENGTH } from './totpEdit';

const boxes = (digits: string): string[] => {
    const code = Array(TOTP_LENGTH).fill('');
    digits.split('').forEach((digit, index) => {
        code[index] = digit;
    });
    return code;
};

describe('applyTotpEdit', () => {
    it('writes a typed digit into the next box when typing without tapping', () => {
        const result = applyTotpEdit(boxes('1234'), '12345', 4);
        expect(result.code).toEqual(boxes('12345'));
        expect(result.activeIndex).toBe(5);
    });

    it('replaces the tapped digit when it is filled', () => {
        // 4 digits entered, tap box 2, type 9 -> box 2's digit is replaced.
        const result = applyTotpEdit(boxes('1234'), '12349', 1);
        expect(result.code).toEqual(boxes('1934'));
        expect(result.activeIndex).toBe(2);
    });

    it('writes into an empty tapped box and advances', () => {
        const result = applyTotpEdit(boxes('12'), '123', 2);
        expect(result.code).toEqual(boxes('123'));
        expect(result.activeIndex).toBe(3);
    });

    it('writes into a deleted (empty) box without shifting the rest', () => {
        // [1,'',3] -> type 9 into box 2: box 3 keeps its digit.
        const withHole = boxes('1');
        withHole[2] = '3';
        const result = applyTotpEdit(withHole, '139', 1);
        expect(result.code).toEqual(['1', '9', '3', '', '', '']);
        expect(result.activeIndex).toBe(2);
    });

    it('empties the tapped digit and stays in that box (no shifting)', () => {
        // 3 digits entered, delete box 2: box 2 becomes empty, box 3 keeps 3.
        const result = applyTotpEdit(boxes('123'), '12', 1);
        expect(result.code).toEqual(['1', '', '3', '', '', '']);
        expect(result.activeIndex).toBe(1);
    });

    it('empties the box before an empty tapped box and moves into it', () => {
        const result = applyTotpEdit(boxes('123'), '12', 3);
        expect(result.code).toEqual(['1', '2', '', '', '', '']);
        expect(result.activeIndex).toBe(2);
    });

    it('moves one box back without deleting when current and previous are empty', () => {
        // Only the first two boxes filled, current is box 4: delete just
        // marks box 3 as current instead of deleting what is inside box 2.
        const withHole = boxes('12');
        withHole[3] = '';
        const result = applyTotpEdit(withHole, '1', 3);
        expect(result.code).toEqual(boxes('12'));
        expect(result.activeIndex).toBe(2);
    });

    it('walks back one box per backspace from an empty position', () => {
        const first = applyTotpEdit(boxes('12'), '1', 2);
        expect(first.code).toEqual(['1', '', '', '', '', '']);
        expect(first.activeIndex).toBe(1);
        const second = applyTotpEdit(first.code, '', first.activeIndex);
        expect(second.code).toEqual(Array(TOTP_LENGTH).fill(''));
        expect(second.activeIndex).toBe(0);
    });

    it('handles a digit typed while the native caret sits elsewhere', () => {
        // Native text changed in the middle; the digit still lands in the
        // tapped box.
        const result = applyTotpEdit(boxes('1234'), '12934', 0);
        expect(result.code).toEqual(['9', '2', '3', '4', '', '']);
    });

    it('replaces from the start on multi-character changes', () => {
        const result = applyTotpEdit(boxes('12'), '987654', 0);
        expect(result.code).toEqual(boxes('987654'));
        expect(result.activeIndex).toBe(5);
    });

    it('ignores non-digit input and filters to six boxes', () => {
        const result = applyTotpEdit(boxes('12'), '12a3b45678', 0);
        expect(result.code).toEqual(boxes('123456'));
    });

    it('keeps the code untouched when the text length is unchanged', () => {
        const result = applyTotpEdit(boxes('1234'), '1234', 1);
        expect(result.code).toEqual(boxes('1234'));
        expect(result.activeIndex).toBe(1);
    });

    it('clamps the active index to the box range', () => {
        // Positional model: the digit lands in the (clamped) tapped box.
        const result = applyTotpEdit(boxes('1234'), '12345', 99);
        expect(result.code).toEqual(['1', '2', '3', '4', '', '5']);
        expect(result.activeIndex).toBe(5);
    });

    it('does nothing when deleting at the first empty box', () => {
        const result = applyTotpEdit(Array(TOTP_LENGTH).fill(''), '', 0);
        expect(result.code).toEqual(Array(TOTP_LENGTH).fill(''));
        expect(result.activeIndex).toBe(0);
    });
});
