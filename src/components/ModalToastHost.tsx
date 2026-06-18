import React from 'react';

// This component is intentionally a no-op.
// Toasts are now rendered in their own transparent Modal via ToastProvider,
// which guarantees they are always on top of all other modals.
export const ModalToastHost = () => {
    return null;
};
