import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
    MfaState,
    MfaSetupResponse,
    RecoveryCodeRemainingResponse,
} from '../../../types/types';
import { useAuth } from '../../auth/state/AuthContext';
import { useMfaActions } from '../hooks/useMfaActions';
import { useMfaEvents } from '../hooks/useMfaEvents';

const MfaContext = createContext<MfaContextType | null>(null);

interface MfaProviderProps {
    children: ReactNode;
}

interface MfaContextType {
    mfaState: MfaState;
    setupMfa: () => Promise<MfaSetupResponse>;
    enableMfa: () => Promise<void>;
    disableMfa: () => Promise<void>;
    setSessionTrust: (mfaTrusted: boolean) => Promise<void>;
    regenerateRecoveryCodes: () => Promise<string[]>;
    getRemainingRecoveryCodes: () => Promise<RecoveryCodeRemainingResponse>;
    isLoading: boolean;
    error: string | null;
}

export const MfaProvider: React.FC<MfaProviderProps> = ({ children }) => {
    const [mfaState, setMfaState] = useState<MfaState>({
        mfaEnabled: false,
        mfaTrusted: false,
    });
    const { user } = useAuth();
    const mfaActions = useMfaActions(setMfaState);

    useMfaEvents(user, setMfaState);

    const value: MfaContextType = {
        mfaState,
        setupMfa: mfaActions.setupMfa,
        enableMfa: mfaActions.enableMfa,
        disableMfa: mfaActions.disableMfa,
        setSessionTrust: mfaActions.setSessionTrust,
        regenerateRecoveryCodes: mfaActions.regenerateRecoveryCodes,
        getRemainingRecoveryCodes: mfaActions.getRemainingRecoveryCodes,
        isLoading: mfaActions.isLoading,
        error: mfaActions.error,
    };

    return (
        <MfaContext.Provider value={value}>
            {children}
        </MfaContext.Provider>
    );
};

export const useMfa = () => {
    const context = useContext(MfaContext);
    if (!context) {
        throw new Error('useMfa must be used within an MfaProvider');
    }
    return context;
};
