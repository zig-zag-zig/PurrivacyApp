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
import {
    ScreenScrollHandle,
    useScreenScrollEngine,
} from './useScreenScrollEngine';

interface ScreenListProps<T> extends Omit<FlatListProps<T>, 'renderItem' | 'data' | 'keyExtractor'> {
    data: T[];
    renderItem: ListRenderItem<T>;
    keyExtractor: (item: T, index: number) => string;
    /** Optional content rendered above the list, inside the scroll region. */
    header?: FlatListProps<T>['ListHeaderComponent'];
    /** Optional content rendered below the list, inside the scroll region. */
    footer?: FlatListProps<T>['ListFooterComponent'];
    contentContainerStyle?: FlatListProps<T>['contentContainerStyle'];
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

    const assignListRef = React.useCallback((node: FlatList<T> | null) => {
        const handle: ScreenScrollHandle | null = node
            ? {
                scrollToY: (y, animated) => node.scrollToOffset({ offset: y, animated }),
                measureInWindow: (callback) => {
                    // getScrollRef() exists on VirtualizedList but is not in the
                    // generated public types.
                    const scrollable = (node as unknown as {
                        getScrollRef?: () => { measureInWindow?: (cb: typeof callback) => void } | null;
                    }).getScrollRef?.();
                    if (scrollable && typeof scrollable.measureInWindow === 'function') {
                        scrollable.measureInWindow(callback);
                    }
                },
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
                        ]}
                        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
                        keyboardDismissMode={props.keyboardDismissMode ?? 'none'}
                        scrollEventThrottle={scrollEventThrottle ?? 16}
                        {...engine.scrollProps}
                    />
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
