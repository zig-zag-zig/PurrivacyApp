import React from 'react';
import {
    FlatList,
    FlatListProps,
    View,
    StyleSheet,
    type ListRenderItem,
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

interface ScreenListProps<T> extends Omit<FlatListProps<T>, 'renderItem' | 'data' | 'keyExtractor'> {
    data: T[];
    renderItem: ListRenderItem<T>;
    keyExtractor: (item: T, index: number) => string;
    /** Optional content rendered above the list, inside the scroll region. */
    header?: FlatListProps<T>['ListHeaderComponent'];
    /** Optional content rendered below the list, inside the scroll region. */
    footer?: FlatListProps<T>['ListFooterComponent'];
    contentContainerStyle?: FlatListProps<T>['contentContainerStyle'];
    /** Hide the floating scroll affordances for this list. Default: shown. */
    hideScrollAffordance?: boolean;
}

/**
 * Virtualized counterpart to {@link ScreenContainer}. Renders a FlatList on the
 * same keyboard-aware scroll engine so long lists (e.g. the Keys tab) recycle
 * rows instead of mounting every item — including each row's native isolated
 * inputs — up front.
 *
 * Use this instead of ScreenContainer when the screen's body is a list that can
 * grow unboundedly. Keep ScreenContainer for short, form-style screens.
 */
function ScreenListInner<T>(
    {
        data,
        renderItem,
        keyExtractor,
        header,
        footer,
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
    }: ScreenListProps<T>,
    ref: React.Ref<FlatList<T>>,
) {
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
    const listRef = React.useRef<FlatList<T> | null>(null);

    const assignListRef = React.useCallback((node: FlatList<T> | null) => {
        listRef.current = node;
        const handle: ScreenScrollHandle | null = node
            ? {
                scrollToY: (y, animated) => node.scrollToOffset({ offset: y, animated }),
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

    // The engine owns onScroll/onLayout/onContentSizeChange; the affordance hook
    // observes the same events. Compose instead of spreading one over the other.
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
                    <FlatList<T>
                        {...props}
                        ref={assignListRef}
                        data={data}
                        renderItem={renderItem}
                        keyExtractor={keyExtractor}
                        ListHeaderComponent={header as FlatListProps<T>['ListHeaderComponent']}
                        ListFooterComponent={footer as FlatListProps<T>['ListFooterComponent']}
                        style={[commonStyles.flex, style]}
                        contentContainerStyle={[
                            commonStyles.p,
                            styles.content,
                            contentContainerStyle,
                            engine.keyboardBottomSpacer > 0 && {
                                paddingBottom: engine.keyboardBottomSpacer + theme.spacing.xxl,
                            },
                            // Reserved unconditionally: rows appended without any
                            // scroll (load more, a restored list) must not have their
                            // last row trapped under a button that only then appears.
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
                    />
                    {!hideScrollAffordance && (
                        <ScrollButtons
                            showScrollToTop={scroll.showScrollToTop}
                            showScrollToBottom={scroll.showScrollToBottom}
                            onScrollToTop={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
                            onScrollToBottom={() => listRef.current?.scrollToEnd({ animated: true })}
                        />
                    )}
                </View>
            </KeyboardAwareScrollContext.Provider>
        </View>
    );
}

export const ScreenList = React.forwardRef(ScreenListInner) as <T>(
    props: ScreenListProps<T> & { ref?: React.Ref<FlatList<T>> },
) => React.ReactElement;

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.xxl,
    },
});
