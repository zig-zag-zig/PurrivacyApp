import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { EventService } from '../../../services/eventService';
import { useToast } from '../../../app/state/ToastContext';
import { logger } from '../../../utils/logger';

export const useAuthEvents = (
    user: User | null,
    signOut: () => Promise<void>,
    loadUser: () => Promise<void>
) => {
    const [activeEvents, setActiveEvents] = useState(new Map());
    const { showToast } = useToast();

    useEffect(() => {
        const initialEvents = EventService.getPendingEvents();
        setActiveEvents(new Map(initialEvents));

        const unsubscribe = EventService.addListener((eventName, payload) => {
            setActiveEvents(prev => {
                const newMap = new Map(prev);
                newMap.set(eventName, payload);
                return newMap;
            });
        });

        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!user) {
            activeEvents.forEach((payload, eventName) => {
                if (eventName === 'signOut' || eventName === 'sessionRevoked') {
                    EventService.consumeEvent(eventName);
                    setActiveEvents(prev => {
                        const newMap = new Map(prev);
                        newMap.delete(eventName);
                        return newMap;
                    });
                }
            });
            return;
        }

        activeEvents.forEach((payload, eventName) => {
            if (eventName === 'user') {
                loadUser();
                EventService.consumeEvent(eventName);
                setActiveEvents(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(eventName);
                    return newMap;
                });
            } else if (eventName === 'sessionRevoked') {
                signOut().catch((error) => {
                    logger.warn('failed to sign out after session revoked', { error });
                });
                EventService.consumeEvent(eventName);
                setActiveEvents(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(eventName);
                    return newMap;
                });
            } else if (eventName === 'signOut') {
                showToast("You have been signed out because your session is invalid, please sign in again", "info");
                signOut().catch((error) => {
                    logger.warn('failed to sign out after session error', { error });
                });
                EventService.consumeEvent(eventName);
                setActiveEvents(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(eventName);
                    return newMap;
                });
            }
        });
    }, [activeEvents, user, signOut, loadUser, showToast]);

    return { activeEvents };
};
