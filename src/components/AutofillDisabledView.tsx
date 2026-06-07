import React, { useCallback, useEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';

import { suppressNativeAutofillTree } from '../native/textInputAutofill';

export const AutofillDisabledView = ({
    collapsable = false,
    ...props
}: ViewProps) => {
    const viewRef = useRef<View | null>(null);

    const assignRef = useCallback((node: View | null) => {
        viewRef.current = node;
        suppressNativeAutofillTree(node);
    }, []);

    useEffect(() => {
        suppressNativeAutofillTree(viewRef.current);
    }, []);

    return (
        <View
            {...props}
            ref={assignRef}
            collapsable={collapsable}
        />
    );
};
