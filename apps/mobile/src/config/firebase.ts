import { getApp, getApps, initializeApp } from 'firebase/app';
import {
    connectAuthEmulator,
    getAuth,
    initializeAuth,
    type Auth,
} from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import googleServices from "../../google-services.json";
import { ENV } from './env';
import { secureAuthStorage } from './secureAuthStorage';

const firebaseConfig = {
    apiKey: googleServices.client[0].api_key[0].current_key,
    authDomain: `${ENV.firebaseProjectId ?? googleServices.project_info.project_id}.firebaseapp.com`,
    projectId: ENV.firebaseProjectId ?? googleServices.project_info.project_id,
    storageBucket: googleServices.project_info.storage_bucket,
    messagingSenderId: googleServices.project_info.project_number,
    appId: googleServices.client[0].client_info.mobilesdk_app_id,
};

const AUTH_EMULATOR_CONNECTED_FLAG = '__purrivacyAuthEmulatorConnected';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const initializeFirebaseAuth = () => {
    try {
        return initializeAuth(app, {
            persistence: getReactNativePersistence(secureAuthStorage),
        });
    } catch (error: any) {
        if (error?.code === 'auth/already-initialized') {
            return getAuth(app);
        }

        throw error;
    }
};

export const auth = initializeFirebaseAuth();

const connectFirebaseAuthEmulator = (firebaseAuth: Auth): void => {
    if (!ENV.firebaseAuthEmulatorUrl) {
        return;
    }

    const authWithFlag = firebaseAuth as Auth & Record<string, boolean | undefined>;
    if (authWithFlag[AUTH_EMULATOR_CONNECTED_FLAG]) {
        return;
    }

    connectAuthEmulator(firebaseAuth, ENV.firebaseAuthEmulatorUrl, {
        disableWarnings: true,
    });
    authWithFlag[AUTH_EMULATOR_CONNECTED_FLAG] = true;
};

connectFirebaseAuthEmulator(auth);
