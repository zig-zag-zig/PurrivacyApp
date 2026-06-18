import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { Spinner } from '../../components/Spinner';
import { theme } from '../../styles/theme';

type BackgroundMode = 'opaque' | 'transparent';

type GlobalSpinnerContextValue = {
    setSourceActive: (sourceId: string, active: boolean, backgroundMode?: BackgroundMode) => void;
};

const GlobalSpinnerContext = createContext<GlobalSpinnerContextValue | null>(null);

let nextSourceId = 0;

interface GlobalSpinnerProviderProps {
    children: ReactNode;
}

export const GlobalSpinnerProvider: React.FC<GlobalSpinnerProviderProps> = ({ children }) => {
    const [activeSourceIds, setActiveSourceIds] = useState<Set<string>>(() => new Set());
    const backgroundModesRef = useRef<Map<string, BackgroundMode>>(new Map());

    const setSourceActive = useCallback((sourceId: string, active: boolean, backgroundMode: BackgroundMode = 'transparent') => {
        if (active) {
            backgroundModesRef.current.set(sourceId, backgroundMode);
        } else {
            backgroundModesRef.current.delete(sourceId);
        }

        setActiveSourceIds(currentSourceIds => {
            const isCurrentlyActive = currentSourceIds.has(sourceId);

            if (isCurrentlyActive === active) {
                return currentSourceIds;
            }

            const nextSourceIds = new Set(currentSourceIds);

            if (active) {
                nextSourceIds.add(sourceId);
            } else {
                nextSourceIds.delete(sourceId);
            }

            return nextSourceIds;
        });
    }, []);

    const value = useMemo<GlobalSpinnerContextValue>(() => ({
        setSourceActive,
    }), [setSourceActive]);

    const hasOpaqueSource = activeSourceIds.size > 0 && (
        Array.from(activeSourceIds).some(id => backgroundModesRef.current.get(id) !== 'transparent')
    );

    return (
        <GlobalSpinnerContext.Provider value={value}>
            <View style={styles.root}>
                {children}
                {activeSourceIds.size > 0 ? (
                    <View
                        pointerEvents="auto"
                        style={[
                            styles.overlay,
                            !hasOpaqueSource && styles.overlayTransparent,
                        ]}
                    >
                        <Spinner visible size="large" />
                    </View>
                ) : null}
            </View>
        </GlobalSpinnerContext.Provider>
    );
};

export const useGlobalSpinner = (active: boolean, options?: { backgroundMode?: BackgroundMode }) => {
    const context = useContext(GlobalSpinnerContext);
    const sourceIdRef = useRef<string | null>(null);
    const backgroundMode = options?.backgroundMode ?? 'transparent';

    if (!sourceIdRef.current) {
        nextSourceId += 1;
        sourceIdRef.current = `global-spinner-${nextSourceId}`;
    }

    useLayoutEffect(() => {
        if (!context) {
            return undefined;
        }

        const sourceId = sourceIdRef.current;

        if (!sourceId) {
            return undefined;
        }

        context.setSourceActive(sourceId, active, backgroundMode);

        return () => {
            context.setSourceActive(sourceId, false);
        };
    }, [active, backgroundMode, context]);
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        elevation: 20000,
        zIndex: 20000,
    },
    overlayTransparent: {
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
});
