import { getApp, getApps, initializeApp } from 'firebase/app';
import {
    getAuth,
    initializeAuth,
} from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import googleServices from "../../google-services.json";
import { secureAuthStorage } from './secureAuthStorage';

const firebaseConfig = {
    apiKey: googleServices.client[0].api_key[0].current_key,
    authDomain: `${googleServices.project_info.project_id}.firebaseapp.com`,
    projectId: googleServices.project_info.project_id,
    storageBucket: googleServices.project_info.storage_bucket,
    messagingSenderId: googleServices.project_info.project_number,
    appId: googleServices.client[0].client_info.mobilesdk_app_id,
};

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
