export const theme = {
    colors: {
        // Core canvas
        background: '#070A12',
        backgroundElevated: '#0A0E18',
        surface: '#111624',
        surfaceElevated: '#171D2D',
        surfaceMuted: '#0C111C',

        // Brand accents
        primary: '#8B7CFF',
        primaryStrong: '#A99FFF',
        primaryMuted: '#292541',
        secondary: '#5EEAD4',
        secondaryMuted: '#123A38',

        // Semantic colors
        error: '#FF6B8A',
        errorMuted: '#3A1724',
        success: '#4ADE80',
        successMuted: '#123320',
        warning: '#FBBF24',
        info: '#60A5FA',

        // Content and borders
        text: '#F6F7FB',
        textSecondary: '#9DA7BA',
        textMuted: '#707B90',
        divider: '#283044',
        dividerStrong: '#384157',
        placeholder: '#687389',
        onPrimary: '#090B13',
        onError: '#090B13',
        overlay: 'rgba(2, 4, 10, 0.78)',
    },
    spacing: {
        xxs: 2,
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
    },
    borderRadius: {
        sm: 10,
        md: 14,
        lg: 20,
        xl: 28,
        pill: 999,
    },
    typography: {
        display: { fontSize: 34, lineHeight: 40 },
        title: { fontSize: 24, lineHeight: 30 },
        heading: { fontSize: 18, lineHeight: 24 },
        body: { fontSize: 16, lineHeight: 24 },
        label: { fontSize: 14, lineHeight: 19 },
        caption: { fontSize: 12, lineHeight: 17 },
    },
    elevation: {
        low: {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 12,
            elevation: 3,
        },
        high: {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.32,
            shadowRadius: 24,
            elevation: 10,
        },
        glow: {
            shadowColor: '#8B7CFF',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 18,
            elevation: 7,
        },
    },
};
