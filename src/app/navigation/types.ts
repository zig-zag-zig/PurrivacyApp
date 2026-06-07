import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
    Signin: undefined;
    Signup: undefined;
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

export type RootNavigationProps = NativeStackNavigationProp<RootStackParamList>;

export type KeyScreenRouteProp = RouteProp<TabParamList, 'Key'>;
export type EncryptScreenRouteProp = RouteProp<TabParamList, 'Encrypt'>;
export type DecryptScreenRouteProp = RouteProp<TabParamList, 'Decrypt'>;
export type SecurityScreenRouteProp = RouteProp<RootStackParamList, 'Security'>;
// Removed: MfaVerification and RecoveryCodesVerification screens are now modals
