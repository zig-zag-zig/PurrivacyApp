/**
 * Reload a module with fresh jest module cache.
 * Resets all modules, then requires the given path.
 * Useful for tests that manipulate process.env and need a fresh module import.
 */
export const reloadModule = <T>(modulePath: string): T => {
    jest.resetModules();
    return require(modulePath) as T;
};
