// Expose __DEV__ as a global variable for third-party modules (expo-modules-core, etc.)
// that reference it as a free variable rather than via globalThis.
(globalThis as any).__DEV__ = true;
