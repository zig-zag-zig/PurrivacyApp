import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

const errorUtils = (globalThis as typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
    setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
  __PURRIVACY_STARTUP_ERROR_HANDLER__?: boolean;
}).ErrorUtils;

if (errorUtils?.setGlobalHandler && !(globalThis as any).__PURRIVACY_STARTUP_ERROR_HANDLER__) {
  const defaultGlobalHandler = errorUtils.getGlobalHandler?.();
  (globalThis as any).__PURRIVACY_STARTUP_ERROR_HANDLER__ = true;
  errorUtils.setGlobalHandler((error, isFatal) => {
    defaultGlobalHandler?.(error, isFatal);
  });
}

let App = require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// It also ensures the environment is set up for Expo Go and native builds.
registerRootComponent(App);
