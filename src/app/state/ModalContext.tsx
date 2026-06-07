import React, { useState, useRef, useEffect, useCallback, createContext, ReactNode, useContext } from 'react';
import { BackHandler } from 'react-native';
import { useToast } from './ToastContext';
import { MfaModal, MfaModalOptions } from '../../features/mfa/components/MfaModal';
import { RecoveryCodesModal, RecoveryCodesModalOptions } from '../../features/mfa/components/RecoveryCodesModal';
import { PassphraseStorageConsentModal } from '../../features/security/components/PassphraseStorageConsentModal';
import {
    setMfaModalHandler,
    setPassphraseStorageConsentHandler,
    setRecoveryCodesModalHandler,
} from '../../api/modalHandler';
import { EventService } from '../../services/eventService';
import { shouldCloseMfaModal } from '../../features/mfa/domain/mfaModalClose';

export type MfaModalResult = {
    code: string | null;
};

type ModalType = 'mfa' | 'recoveryCodes' | 'passphraseStorageConsent' | null;

interface ModalContextType {
    showMfaModal: (options: MfaModalOptions) => Promise<MfaModalResult>; // Returns MFA code and close function or null if cancelled
    showRecoveryCodesModal: (options: RecoveryCodesModalOptions) => Promise<void>;
    showPassphraseStorageConsentModal: () => Promise<boolean>;
    hideModal: () => void;
    currentModal: ModalType;
    modalProps: any;
    triggerMfaClear: boolean;
}

const ModalContext = createContext<ModalContextType | null>(null);

interface ModalProviderProps {
    children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
    const [currentModal, setCurrentModal] = useState<ModalType>(null);
    const [modalProps, setModalProps] = useState<any>(null);
    const currentModalRef = useRef<ModalType>(null);
    const modalPropsRef = useRef<any>(null);
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
        currentModalRef.current = null;
        modalPropsRef.current = null;
        setCurrentModal(null);
        setModalProps(null);
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
                if (payload?.isWrongMfaCode) {
                    showToast('The MFA code you entered was incorrect. Please try again.', 'info');
                }
            } else if (eventName === 'closeMfaModal') {
                EventService.consumeEvent('closeMfaModal');
                if (currentModalRef.current !== 'mfa') {
                    clearScheduledMfaClose();
                    return;
                }

                if (!shouldCloseMfaModal(Boolean(modalPropsRef.current?.isLoginFlow), payload)) {
                    return;
                }

                const delayMs = Number(payload?.delayMs ?? 0);

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
            currentModalRef.current = 'mfa';
            modalPropsRef.current = options;
            setCurrentModal('mfa');
            setModalProps(options);
            resolveMfaPromiseRef.current = (code: string | null) => {
                resolve({
                    code,
                });
            };
        });
    }, [hideModal]);

    const showRecoveryCodesModal = useCallback((options: RecoveryCodesModalOptions): Promise<void> => {
        return new Promise((resolve) => {
            currentModalRef.current = 'recoveryCodes';
            modalPropsRef.current = options;
            setCurrentModal('recoveryCodes');
            setModalProps(options);
            resolveRecoveryCodesPromiseRef.current = () => {
                resolve();
            };
        });
    }, []);

    const showPassphraseStorageConsentModal = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            currentModalRef.current = 'passphraseStorageConsent';
            modalPropsRef.current = null;
            setCurrentModal('passphraseStorageConsent');
            setModalProps(null);
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

    const value: ModalContextType = {
        showMfaModal,
        showRecoveryCodesModal,
        showPassphraseStorageConsentModal,
        hideModal,
        currentModal,
        modalProps,
        triggerMfaClear,
    };

    return (
        <ModalContext.Provider value={value}>
            {children}
            {currentModal === 'mfa' && (
                <MfaModal
                    onClose={hideModal}
                    onComplete={completeMfa}
                    triggerClear={triggerMfaClear}
                    setTriggerClear={setTriggerMfaClear}
                    {...modalProps}
                />
            )}
            {currentModal === 'recoveryCodes' && (
                <RecoveryCodesModal
                    onComplete={completeRecoveryCodes}
                    {...modalProps}
                />
            )}
            {currentModal === 'passphraseStorageConsent' && (
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
