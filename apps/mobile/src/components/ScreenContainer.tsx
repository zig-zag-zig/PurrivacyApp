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
import { measureScrollNodeInWindow } from './measureScrollNode';
import {
    ScreenScrollHandle,
    useScreenScrollEngine,
} from './useScreenScrollEngine';
import ScrollButtons, {
    useScrollAffordance,
    useScrollRailContentInset,
} from './ScrollAffordance';
import {
    composeContentSizeHandlers,
    composeLayoutHandlers,
    composeScrollHandlers,
} from './composeScrollEventHandlers';

interface ScreenContainerProps extends ScrollViewProps {
    children: React.ReactNode;
    safeArea?: boolean;
    /** Hide the floating scroll affordances for this screen. Default: shown. */
    hideScrollAffordance?: boolean;
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
        hideScrollAffordance = false,
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
        const scroll = useScrollAffordance();
        const railInset = useScrollRailContentInset();
        const scrollViewRef = React.useRef<ScrollView | null>(null);

        const assignScrollRef = React.useCallback((node: ScrollView | null) => {
            scrollViewRef.current = node;
            const handle: ScreenScrollHandle | null = node
                ? {
                    scrollToY: (y, animated) => node.scrollTo({ y, animated }),
                    measureInWindow: (callback) => measureScrollNodeInWindow(node, callback),
                }
                : null;
            engine.attachRef(handle);
            if (typeof ref === 'function') {
                ref(node);
            } else if (ref) {
                ref.current = node;
            }
        }, [engine, ref]);

        // The engine owns onScroll/onLayout/onContentSizeChange; the affordance
        // hook observes the same events. Compose instead of spreading one over
        // the other so neither consumer silently disappears.
        const scrollProps = engine.scrollProps;
        const mergedScrollProps = {
            ...scrollProps,
            onScroll: composeScrollHandlers(scrollProps.onScroll, scroll.onScroll),
            onLayout: composeLayoutHandlers(scrollProps.onLayout, scroll.onViewportLayout),
            onContentSizeChange: composeContentSizeHandlers(
                scrollProps.onContentSizeChange,
                scroll.onContentSizeChange,
            ),
        };

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
                            // Reserved unconditionally: content that grows past the
                            // viewport must not have its last row (usually the primary
                            // action) trapped under a button that only then appears.
                            // `max`, not a later entry, so a keyboard spacer is never
                            // shrunk back to the rail's own reservation.
                            !hideScrollAffordance && {
                                paddingBottom: Math.max(
                                    railInset,
                                    engine.keyboardBottomSpacer > 0
                                        ? engine.keyboardBottomSpacer + theme.spacing.xxl
                                        : 0,
                                ),
                            },
                        ]}
                        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
                        keyboardDismissMode={props.keyboardDismissMode ?? 'none'}
                        scrollEventThrottle={scrollEventThrottle ?? 16}
                        {...mergedScrollProps}
                    >
                        {children}
                    </ScrollView>
                    {!hideScrollAffordance && (
                        <ScrollButtons
                            showScrollToTop={scroll.showScrollToTop}
                            showScrollToBottom={scroll.showScrollToBottom}
                            onScrollToTop={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
                            onScrollToBottom={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                        />
                    )}
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
