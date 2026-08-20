import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

export type RootStackParamList = {
    Signin: undefined;
    Signup: { username?: string } | undefined;
    // Signup secrets travel via pendingSignupSession (in-process, APP-SEC-007),
    // never through navigation state.
    SignupSeedVerification: undefined;
    RecoverAccount: undefined;
    Security: { type: 'password' | 'delete' };
    MfaSetup: undefined;
    Home: {
        screen?: keyof TabParamList;
        // allow passing the corresponding Tab params (e.g. { action: 'create' })
        params?: TabParamList[keyof TabParamList] | undefined;
    } | undefined;
};

export type TabParamList = {
    Key: { text?: string; action?: 'create' | 'import' } | undefined;
    Encrypt: { text?: string } | undefined;
    Decrypt: { text?: string } | undefined;
    Settings: undefined;
};

export type RootNavigationProps = StackNavigationProp<RootStackParamList>;

export type KeyScreenRouteProp = RouteProp<TabParamList, 'Key'>;
export type EncryptScreenRouteProp = RouteProp<TabParamList, 'Encrypt'>;
export type DecryptScreenRouteProp = RouteProp<TabParamList, 'Decrypt'>;
export type SecurityScreenRouteProp = RouteProp<RootStackParamList, 'Security'>;
// Removed: MfaVerification and RecoveryCodesVerification screens are now modals
