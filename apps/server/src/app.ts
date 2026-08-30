import express from 'express';
import { errorMiddleware } from './api/middleware/errorMiddleware';
import { requestMetadata } from './api/middleware/requestMetadata';
import { API_V1_PREFIX, createApiV1Routes } from './api/v1Routes';
import { env } from './config/env';
import { requestContext } from './api/middleware/requestContext';
import { requestLogger } from './api/middleware/requestLogger';
import { setupExpressErrorMonitoring } from './infrastructure/monitoring/sentry';

const app = express();
app.set('trust proxy', env.trustProxy);

// Middleware
app.use(requestContext);
app.use(requestLogger);
app.use(express.json({ limit: env.requestJsonLimit }));
app.use(express.urlencoded({ limit: env.requestFormLimit, extended: true }));
app.use(requestMetadata);

// API routes
app.use(API_V1_PREFIX, createApiV1Routes());

// Error handling
setupExpressErrorMonitoring(app);
app.use(errorMiddleware);

export default app;
