import express, { Router } from 'express';
import { rateLimiter } from './middleware/rateLimiter';
import mfaRoutes from '../features/mfa/api/mfaRoutes';
import sessionRoutes from '../features/session/api/sessionRoutes';
import userRoutes from '../features/user/api/userRoutes';

export const API_V1_PREFIX = '/v1';

export const createApiV1Routes = (): Router => {
  const router = express.Router();

  router.get('/health', async (_, res) => {
    res.status(200).json({ status: 'healthy' });
  });

  // Aggregate per-IP budget for every /v1 route except the health check
  // (used by the Docker healthcheck). Stricter endpoint-specific limiters
  // still apply on top inside each feature router.
  router.use(rateLimiter.general);

  router.use('/user', userRoutes);
  router.use('/auth', sessionRoutes);
  router.use('/mfa', mfaRoutes);

  return router;
};
