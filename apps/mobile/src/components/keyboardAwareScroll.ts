type KeyboardAwareScrollParams = {
    currentScrollY: number;
    inputBottom: number;
    inputTop: number;
    visibleBottom: number;
    visibleTop: number;
};

type AdditionalKeyboardSpacerParams = {
    contentHeight: number;
    targetScrollY: number;
    viewportHeight: number;
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

export const resolveAdditionalKeyboardSpacer = ({
    contentHeight,
    targetScrollY,
    viewportHeight,
}: AdditionalKeyboardSpacerParams): number => {
    const maxScrollY = Math.max(0, contentHeight - viewportHeight);
    return Math.max(0, Math.ceil(targetScrollY - maxScrollY));
};
