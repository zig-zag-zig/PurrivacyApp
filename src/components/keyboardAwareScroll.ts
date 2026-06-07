export type KeyboardAwareScrollParams = {
    currentScrollY: number;
    inputBottom: number;
    inputTop: number;
    visibleBottom: number;
    visibleTop: number;
};

export const resolveKeyboardAwareScrollY = ({
    currentScrollY,
    inputBottom,
    inputTop,
    visibleBottom,
    visibleTop,
}: KeyboardAwareScrollParams): number => {
    let nextScrollY = currentScrollY;

    if (inputBottom > visibleBottom) {
        nextScrollY += inputBottom - visibleBottom;
    } else if (inputTop < visibleTop) {
        nextScrollY -= visibleTop - inputTop;
    }

    return Math.max(0, Math.ceil(nextScrollY));
};
