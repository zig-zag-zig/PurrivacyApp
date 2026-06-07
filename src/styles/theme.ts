export const theme = {
    colors: {
        background: '#121212',
        surface: '#1E1E1E',
        primary: '#BB86FC',
        secondary: '#03DAC6',
        error: '#CF6679',
        text: '#FFFFFF',
        textSecondary: '#A9A9A9',
        divider: '#383838',
        placeholder: '#666666',
        onPrimary: '#000000',
        onError: '#000000',
        success: '#43a047',
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32
    },
    borderRadius: {
        sm: 4,
        md: 8,
        lg: 16
    },
    typography: {
        title: { fontSize: 20 },
        body: { fontSize: 16 },
        label: { fontSize: 14 },
        caption: { fontSize: 12 }
    },
    elevation: {
        low: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2
        },
        high: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6
        }
    }
};