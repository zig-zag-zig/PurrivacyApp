import React from 'react';

export type KeyboardAwareInputNode = {
    measureInWindow: (
        callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
};

type KeyboardAwareScrollContextValue = {
    scrollInputIntoView: (node: KeyboardAwareInputNode | null) => void;
};

const noopContext: KeyboardAwareScrollContextValue = {
    scrollInputIntoView: () => undefined,
};

export const KeyboardAwareScrollContext = React.createContext<KeyboardAwareScrollContextValue>(noopContext);

export const useKeyboardAwareScroll = (): KeyboardAwareScrollContextValue => (
    React.useContext(KeyboardAwareScrollContext)
);
