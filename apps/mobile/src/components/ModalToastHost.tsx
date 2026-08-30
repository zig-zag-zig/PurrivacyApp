import React from 'react';

import { ToastViewport } from '../app/state/ToastContext';

/**
 * Renders the current toast INSIDE the hosting modal.
 *
 * Android RN Modals are separate windows layered above the app root, so the
 * root-level ToastViewport renders underneath any open Modal and is invisible
 * there. Every full-screen modal mounts this host so toasts fired while the
 * modal is open (e.g. "The MFA code you entered was incorrect" inside the MFA
 * modal) are actually shown. Both viewports read the same toast state; while a
 * modal is open only the modal-level copy is visible, so nothing is rendered
 * twice on screen.
 */
export const ModalToastHost = () => {
    return <ToastViewport />;
};
