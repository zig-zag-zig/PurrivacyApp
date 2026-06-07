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

type GlobalSpinnerContextValue = {
    setSourceActive: (sourceId: string, active: boolean) => void;
};

const GlobalSpinnerContext = createContext<GlobalSpinnerContextValue | null>(null);

let nextSourceId = 0;

interface GlobalSpinnerProviderProps {
    children: ReactNode;
}

export const GlobalSpinnerProvider: React.FC<GlobalSpinnerProviderProps> = ({ children }) => {
    const [activeSourceIds, setActiveSourceIds] = useState<Set<string>>(() => new Set());

    const setSourceActive = useCallback((sourceId: string, active: boolean) => {
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

    return (
        <GlobalSpinnerContext.Provider value={value}>
            <View style={styles.root}>
                {children}
                {activeSourceIds.size > 0 ? (
                    <View pointerEvents="auto" style={styles.overlay}>
                        <Spinner visible size="large" />
                    </View>
                ) : null}
            </View>
        </GlobalSpinnerContext.Provider>
    );
};

export const useGlobalSpinner = (active: boolean) => {
    const context = useContext(GlobalSpinnerContext);
    const sourceIdRef = useRef<string | null>(null);

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

        context.setSourceActive(sourceId, active);

        return () => {
            context.setSourceActive(sourceId, false);
        };
    }, [active, context]);
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
});
