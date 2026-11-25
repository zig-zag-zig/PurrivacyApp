import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';

/**
 * Bottom-right dock bookkeeping shared by floating surfaces.
 *
 * The scroll affordances live in the bottom-right corner of every scrolling
 * screen. The operation center's activity button is also docked there (it is
 * rendered above the navigator, so a screen cannot lay itself out around it).
 * Screens therefore publish the space that button occupies, and the scroll
 * rail is lifted above it instead of covering it. This is the same mechanism
 * Pawify uses when its selection action bar is on screen — a fixed dock
 * raises the affordance rail rather than letting the two overlap.
 *
 * Geometry is published in window coordinates (`bottom` = distance from the
 * window bottom to the dock's bottom edge) because the publisher lives above
 * the navigator. The consumer subtracts the bottom navigation chrome that sits
 * below its own viewport (see {@link ScreenBottomChromeContext}).
 */
export type OverlayDock = {
    /** Distance from the window bottom to the dock's bottom edge. */
    bottom: number;
    /** Height of the dock, including its ring/badge padding. */
    height: number;
};

type OverlayDockContextValue = {
    dock: OverlayDock | null;
    publishDock: (dock: OverlayDock | null) => void;
};

/** Breathing room between the dock and the buttons above it. */
export const OVERLAY_DOCK_GAP = 8;

/**
 * Height of bottom navigation chrome (the tab bar) inside the current screen.
 * A screen at the root of a stack gets 0. Tab screens get the exact tab bar
 * height, which is what turns window-relative dock geometry into screen-space
 * clearance.
 */
export const ScreenBottomChromeContext = createContext(0);

export const useScreenBottomChromeHeight = (): number => useContext(ScreenBottomChromeContext);

export const OverlayDockContext = createContext<OverlayDockContextValue | null>(null);

const sameDock = (a: OverlayDock | null, b: OverlayDock | null): boolean => (
    a === b || (a?.bottom === b?.bottom && a?.height === b?.height)
);

export const OverlayDockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [dock, setDock] = useState<OverlayDock | null>(null);

    const publishDock = useCallback((next: OverlayDock | null) => {
        // Publishers re-run on every operation-state change; holding the same
        // object keeps the rail from re-rendering when the geometry is unchanged.
        setDock(previous => (sameDock(previous, next) ? previous : next));
    }, []);

    const value = useMemo(() => ({ dock, publishDock }), [dock, publishDock]);

    return (
        <OverlayDockContext.Provider value={value}>
            {children}
        </OverlayDockContext.Provider>
    );
};

/** Registers a dock. Returns undefined outside a provider (e.g. modals). */
export const useOverlayDockPublisher = (): ((dock: OverlayDock | null) => void) | undefined => (
    useContext(OverlayDockContext)?.publishDock
);

/**
 * Shields its subtree from any published dock.
 *
 * A native Modal renders in its own window above the app, so a screen-level
 * dock (the operation center button) is not visible there. Without this the
 * rail inside a modal would lift itself above a button the user cannot see.
 */
export const OverlayDockIsolation: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <OverlayDockContext.Provider value={null}>{children}</OverlayDockContext.Provider>
);

/**
 * Resolves the bottom offset for a rail that must stay above the dock.
 *
 * `dock.bottom` is the distance from the *window* bottom to the dock's bottom
 * edge; the rail is positioned from the *screen* bottom. So the dock's top
 * edge, in window space, is `bottom + height`, and in screen space it is
 * `bottom + height - chromeHeight`. Adding the gap gives the rail's bottom
 * offset. Kept pure so the arithmetic is testable.
 */
export const resolveOverlayDockBottom = (
    dock: OverlayDock | null,
    chromeHeight: number,
    baseBottom: number,
): number => {
    if (!dock) return baseBottom;

    const clearance = dock.bottom + dock.height - Math.max(0, chromeHeight) + OVERLAY_DOCK_GAP;
    // A dock that sits entirely below the screen (e.g. published while a modal
    // is open) must not push the rail up for no reason.
    return Math.max(baseBottom, clearance);
};

/**
 * Bottom offset for a floating rail in the current screen: the caller's base
 * offset, lifted above the overlay dock when one is published. Outside a
 * provider (native modals are separate windows) the dock is not visible, so
 * the base offset stands.
 */
export const useOverlayDockClearance = (baseBottom: number, enabled = true): number => {
    const dock = useContext(OverlayDockContext)?.dock ?? null;
    const chromeHeight = useScreenBottomChromeHeight();

    if (!enabled) return baseBottom;
    return resolveOverlayDockBottom(dock, chromeHeight, baseBottom);
};
