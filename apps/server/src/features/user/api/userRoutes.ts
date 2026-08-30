import { Router } from 'express';
import { UserService } from '../application/UserService';
import { authenticate, verifySensitiveMfa } from '../../../api/middleware/authMiddleware';
import { asyncHandler } from '../../../utils/asyncHandler';
import { ResponseUtils } from '../../../utils/responseUtils';
import { rateLimiter } from '../../../api/middleware/rateLimiter';
import { requireAuthenticatedUserId } from '../../../api/http/requestContextHelpers';
import {
    parseChangePasswordRequest,
    parseCreateUserRequest,
    parseDeletePushTokenRequest,
    parseKeyRecordIdParam,
    parseKeyRecordListQuery,
    parseKeyRecordRequest,
    parseSavePushTokenRequest,
    parseSetPassphraseStorageRequest,
} from './userRequests';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';

const router = Router();


// Get user data
router.get('', authenticate('session'), rateLimiter.authenticatedRead, asyncHandler(async (req, res) => {
    const userId = requireAuthenticatedUserId(req);
    const user = await UserService.getEncryptedUser(userId);
    ResponseUtils.success(res, user);
}));

// Create a new user before the backend session exists.
router.post('', authenticate('firebase'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const userData = parseCreateUserRequest(req.body);
    const response = await UserService.createUser(userData, requireAuthenticatedUserId(req));
    ResponseUtils.success(res, response, 201);
}));

router.get('/key-records', authenticate('session'), rateLimiter.authenticatedRead, asyncHandler(async (req, res) => {
    const response = await UserService.getEncryptedKeyRecords(
        requireAuthenticatedUserId(req),
        parseKeyRecordListQuery(req.query),
    );
    ResponseUtils.success(res, response);
}));

router.post('/key-records', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const key = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(parseKeyRecordRequest(req.body), 'key');
    const response = await UserService.addEncryptedKeyRecord(requireAuthenticatedUserId(req), key);
    ResponseUtils.success(res, response, 201);
}));

router.put('/key-records/:recordId', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const recordId = parseKeyRecordIdParam(req.params.recordId);
    const key = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(parseKeyRecordRequest(req.body), 'key');
    const response = await UserService.updateEncryptedKeyRecord(requireAuthenticatedUserId(req), recordId, key);
    ResponseUtils.success(res, response);
}));

router.delete('/key-records/:recordId', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const recordId = parseKeyRecordIdParam(req.params.recordId);
    await UserService.deleteEncryptedKeyRecord(requireAuthenticatedUserId(req), recordId);
    ResponseUtils.noContent(res);
}));

// Change DEK password
router.post('/change-password', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    const dekPassword = parseChangePasswordRequest(req.body);
    const response = await UserService.changeDekPassword(requireAuthenticatedUserId(req), dekPassword);
    ResponseUtils.successWithRecoveryCodes(res, response);
}));

// Delete user
router.delete('', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    await UserService.deleteUser(requireAuthenticatedUserId(req));
    ResponseUtils.noContent(res);
}));

// Save push token
router.post('/save-push-token', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const { deviceId, pushToken } = parseSavePushTokenRequest(req.body, req.deviceId);
    await UserService.savePushToken(requireAuthenticatedUserId(req), deviceId, pushToken);
    ResponseUtils.noContent(res);
}));

// Delete push token
router.post('/delete-push-token', authenticate('firebase'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const pushToken = parseDeletePushTokenRequest(req.body);
    await UserService.deletePushToken(requireAuthenticatedUserId(req), pushToken);
    ResponseUtils.noContent(res);
}));

// Set passphrase storage enabled/disabled
router.post('/passphrase-storage', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    const userId = requireAuthenticatedUserId(req);
    const { enabled } = parseSetPassphraseStorageRequest(req.body);
    await UserService.setPassphraseStorage(userId, enabled, req.deviceId);
    ResponseUtils.noContent(res);
}));

export default router;
