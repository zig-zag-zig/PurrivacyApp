import { db } from '../../../infrastructure/firebase';
import { NotificationService } from '../../notification/application/NotificationService';
import { UserService } from '../../user/application/UserService';
import { getMfaSecurityRef } from './mfaRefs';

export const disableMfa = async (userId: string, currentDeviceId?: string): Promise<void> => {
    const batch = db.batch();
    UserService.queueMfaEnabledUpdate(batch, userId, false);
    batch.delete(getMfaSecurityRef(userId));
    await batch.commit();

    await NotificationService.sendDataOnlyNotificationSafe(
        userId,
        'mfaState',
        'mfa disable',
        { mfaEnabled: false, mfaTrusted: false },
        { excludeDeviceId: currentDeviceId },
    );
};
