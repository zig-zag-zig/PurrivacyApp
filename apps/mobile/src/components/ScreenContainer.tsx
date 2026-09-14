import React from 'react';
import {
    ScrollView,
    View,
    ScrollViewProps,
    StyleSheet,
} from 'react-native';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { KeyboardAwareScrollContext } from './KeyboardAwareScrollContext';
import {
    ScreenScrollHandle,
    useScreenScrollEngine,
} from './useScreenScrollEngine';

interface ScreenContainerProps extends ScrollViewProps {
    children: React.ReactNode;
    safeArea?: boolean;
}

export const ScreenContainer = React.forwardRef<ScrollView, ScreenContainerProps>(
    ({
        children,
        style,
        contentContainerStyle,
        keyboardShouldPersistTaps,
        onContentSizeChange,
        onLayout,
        onScroll,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        scrollEventThrottle,
        ...props
    }, ref) => {
        const engine = useScreenScrollEngine({
            onContentSizeChange,
            onLayout,
            onScroll,
            onTouchStart,
            onTouchMove,
            onTouchEnd,
        });

        const assignScrollRef = React.useCallback((node: ScrollView | null) => {
            const handle: ScreenScrollHandle | null = node
                ? {
                    scrollToY: (y, animated) => node.scrollTo({ y, animated }),
                    // measureInWindow exists on the native ScrollView component
                    // but is not declared on the public type.
                    measureInWindow: (callback) =>
                        (node as unknown as { measureInWindow: (cb: typeof callback) => void })
                            .measureInWindow(callback),
                }
                : null;
            engine.attachRef(handle);
            if (typeof ref === 'function') {
                ref(node);
            } else if (ref) {
                ref.current = node;
            }
        }, [engine, ref]);

        return (
            <View style={commonStyles.container}>
                <KeyboardAwareScrollContext.Provider value={engine.contextValue}>
                    <View style={commonStyles.flex}>
                    <ScrollView
                        {...props}
                        ref={assignScrollRef}
                        style={[commonStyles.flex, style]}
                        contentContainerStyle={[
                            commonStyles.p,
                            styles.content,
                            contentContainerStyle,
                            engine.keyboardBottomSpacer > 0 && {
                                paddingBottom: engine.keyboardBottomSpacer + theme.spacing.xxl,
                            },
                        ]}
                        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
                        keyboardDismissMode={props.keyboardDismissMode ?? 'none'}
                        scrollEventThrottle={scrollEventThrottle ?? 16}
                        {...engine.scrollProps}
                    >
                        {children}
                    </ScrollView>
                    </View>
                </KeyboardAwareScrollContext.Provider>
            </View>
        );
    }
);

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.xxl,
    },
});
