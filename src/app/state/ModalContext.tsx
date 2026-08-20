import React, { useState, useRef, useEffect, useCallback, createContext, ReactNode, useContext, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { useToast } from './ToastContext';
import { MfaModal } from '../../features/mfa/components/MfaModal';
import { RecoveryCodesModal } from '../../features/mfa/components/RecoveryCodesModal';
import type {
    MfaModalOptions,
    MfaModalResult,
    ModalRequest,
    RecoveryCodesModalOptions,
} from '../../shared/modals/types';
import { PassphraseStorageConsentModal } from '../../features/security/components/PassphraseStorageConsentModal';
import {
    setMfaModalHandler,
    setPassphraseStorageConsentHandler,
    setRecoveryCodesModalHandler,
} from '../../api/modalHandler';
import { EventService } from '../../services/eventService';
import type { AppEventPayloadMap } from '../../services/eventService';
import { shouldCloseMfaModal } from '../../features/mfa/domain/mfaModalClose';
import { modalPropsOf, modalTypeOf, ModalType } from './modalState';



interface ModalContextType {
    showMfaModal: (options: MfaModalOptions) => Promise<MfaModalResult>; // Returns MFA code and close function or null if cancelled
    showRecoveryCodesModal: (options: RecoveryCodesModalOptions) => Promise<void>;
    showPassphraseStorageConsentModal: () => Promise<boolean>;
    hideModal: () => void;
    currentModal: ModalType;
    modalProps: MfaModalOptions | RecoveryCodesModalOptions | null;
    triggerMfaClear: boolean;
}

const ModalContext = createContext<ModalContextType | null>(null);

interface ModalProviderProps {
    children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
    // Discriminated-union modal state: `type` drives rendering and back-press
    // handling, `options` carries the per-modal props.
    const [modalState, setModalState] = useState<ModalRequest | null>(null);
    const modalStateRef = useRef<ModalRequest | null>(null);
    const currentModal = modalTypeOf(modalState);
    const modalProps = modalPropsOf(modalState);
    const resolveMfaPromiseRef = useRef<((value: string | null) => void) | null>(null);
    const resolveRecoveryCodesPromiseRef = useRef<(() => void) | null>(null);
    const resolvePassphraseStorageConsentPromiseRef = useRef<((enabled: boolean) => void) | null>(null);
    const closeMfaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { showToast } = useToast();
    const [triggerMfaClear, setTriggerMfaClear] = useState(false);

    const clearScheduledMfaClose = useCallback(() => {
        if (closeMfaTimeoutRef.current) {
            clearTimeout(closeMfaTimeoutRef.current);
            closeMfaTimeoutRef.current = null;
        }
    }, []);

    const hideModal = useCallback(() => {
        clearScheduledMfaClose();
        modalStateRef.current = null;
        setModalState(null);
        if (resolveMfaPromiseRef.current) {
            resolveMfaPromiseRef.current(null);
            resolveMfaPromiseRef.current = null;
        }
        if (resolveRecoveryCodesPromiseRef.current) {
            resolveRecoveryCodesPromiseRef.current();
            resolveRecoveryCodesPromiseRef.current = null;
        }
        if (resolvePassphraseStorageConsentPromiseRef.current) {
            resolvePassphraseStorageConsentPromiseRef.current(false);
            resolvePassphraseStorageConsentPromiseRef.current = null;
        }
    }, [clearScheduledMfaClose]);

    const handleBackPress = useCallback(() => {
        if (currentModal === 'mfa') {
            showToast('MFA verification was cancelled', 'info');
            hideModal();
            return true;
        } else if (currentModal === 'recoveryCodes') {
            return true;
        } else if (currentModal === 'passphraseStorageConsent') {
            hideModal();
            return true;
        }
        return false;
    }, [currentModal, modalProps, hideModal, showToast]);

    useEffect(() => {
        if (!currentModal) return;

        const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
        return () => {
            subscription.remove();
        };
    }, [currentModal, handleBackPress]);

    useEffect(() => {
        const unsubscribe = EventService.addListener((eventName, payload) => {
            if (eventName === 'clearMfaCode') {
                EventService.consumeEvent('clearMfaCode');
                setTriggerMfaClear(true);
                // The listener payload is the per-event union; the eventName
                // check above correlates it (AppEventPayloadMap contract).
                const clearPayload = payload as AppEventPayloadMap['clearMfaCode'];
                if (clearPayload?.isWrongMfaCode) {
                    showToast('The MFA code you entered was incorrect. Please try again.', 'info');
                }
            } else if (eventName === 'closeMfaModal') {
                EventService.consumeEvent('closeMfaModal');
                if (modalStateRef.current?.type !== 'mfa') {
                    clearScheduledMfaClose();
                    return;
                }

                const isLoginFlow = modalStateRef.current.type === 'mfa'
                    ? Boolean(modalStateRef.current.options.isLoginFlow)
                    : false;
                const closePayload = payload as AppEventPayloadMap['closeMfaModal'];
                if (!shouldCloseMfaModal(isLoginFlow, closePayload)) {
                    return;
                }

                const delayMs = Number(closePayload?.delayMs ?? 0);

                if (Number.isFinite(delayMs) && delayMs > 0) {
                    clearScheduledMfaClose();
                    closeMfaTimeoutRef.current = setTimeout(() => {
                        closeMfaTimeoutRef.current = null;
                        hideModal();
                    }, delayMs);
                    return;
                }

                hideModal();
            }
        });

        return () => {
            clearScheduledMfaClose();
            unsubscribe();
        };
    }, [clearScheduledMfaClose, hideModal, showToast]);

    const showMfaModal = useCallback((options: MfaModalOptions): Promise<MfaModalResult> => {
        return new Promise((resolve) => {
            const request: ModalRequest = { type: 'mfa', options };
            modalStateRef.current = request;
            setModalState(request);
            resolveMfaPromiseRef.current = (code: string | null) => {
                resolve({
                    code,
                });
            };
        });
    }, [hideModal]);

    const showRecoveryCodesModal = useCallback((options: RecoveryCodesModalOptions): Promise<void> => {
        return new Promise((resolve) => {
            const request: ModalRequest = { type: 'recoveryCodes', options };
            modalStateRef.current = request;
            setModalState(request);
            resolveRecoveryCodesPromiseRef.current = () => {
                resolve();
            };
        });
    }, []);

    const showPassphraseStorageConsentModal = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            const request: ModalRequest = { type: 'passphraseStorageConsent' };
            modalStateRef.current = request;
            setModalState(request);
            resolvePassphraseStorageConsentPromiseRef.current = resolve;
        });
    }, []);

    const completeMfa = useCallback((code: string) => {
        if (resolveMfaPromiseRef.current) {
            resolveMfaPromiseRef.current(code);
            resolveMfaPromiseRef.current = null;
        }
    }, []);

    const completeRecoveryCodes = useCallback(() => {
        if (resolveRecoveryCodesPromiseRef.current) {
            resolveRecoveryCodesPromiseRef.current();
            resolveRecoveryCodesPromiseRef.current = null;
        }
        hideModal();
    }, [hideModal]);

    const completePassphraseStorageConsent = useCallback((enabled: boolean) => {
        if (resolvePassphraseStorageConsentPromiseRef.current) {
            resolvePassphraseStorageConsentPromiseRef.current(enabled);
            resolvePassphraseStorageConsentPromiseRef.current = null;
        }
        hideModal();
    }, [hideModal]);

    useEffect(() => {
        setMfaModalHandler(showMfaModal);
        setRecoveryCodesModalHandler(showRecoveryCodesModal);
        setPassphraseStorageConsentHandler(showPassphraseStorageConsentModal);

        return () => {
            setMfaModalHandler(null);
            setRecoveryCodesModalHandler(null);
            setPassphraseStorageConsentHandler(null);
            if (resolveMfaPromiseRef.current) {
                resolveMfaPromiseRef.current(null);
                resolveMfaPromiseRef.current = null;
            }
            if (resolveRecoveryCodesPromiseRef.current) {
                resolveRecoveryCodesPromiseRef.current();
                resolveRecoveryCodesPromiseRef.current = null;
            }
            if (resolvePassphraseStorageConsentPromiseRef.current) {
                resolvePassphraseStorageConsentPromiseRef.current(false);
                resolvePassphraseStorageConsentPromiseRef.current = null;
            }
        };
    }, [showMfaModal, showPassphraseStorageConsentModal, showRecoveryCodesModal]);

    const value = useMemo<ModalContextType>(() => ({
        showMfaModal,
        showRecoveryCodesModal,
        showPassphraseStorageConsentModal,
        hideModal,
        currentModal,
        modalProps,
        triggerMfaClear,
    }), [
        showMfaModal,
        showRecoveryCodesModal,
        showPassphraseStorageConsentModal,
        hideModal,
        currentModal,
        modalProps,
        triggerMfaClear,
    ]);

    return (
        <ModalContext.Provider value={value}>
            {children}
            {modalState?.type === 'mfa' && (
                <MfaModal
                    onClose={hideModal}
                    onComplete={completeMfa}
                    triggerClear={triggerMfaClear}
                    setTriggerClear={setTriggerMfaClear}
                    {...modalState.options}
                />
            )}
            {modalState?.type === 'recoveryCodes' && (
                <RecoveryCodesModal
                    onComplete={completeRecoveryCodes}
                    {...modalState.options}
                />
            )}
            {modalState?.type === 'passphraseStorageConsent' && (
                <PassphraseStorageConsentModal
                    visible
                    onStore={() => completePassphraseStorageConsent(true)}
                    onCancel={() => completePassphraseStorageConsent(false)}
                />
            )}
        </ModalContext.Provider>
    );
};

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    return context;
};
