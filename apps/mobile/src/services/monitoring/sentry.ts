import * as Sentry from '@sentry/react-native';
import type React from 'react';
import { ENV } from '../../config/env';

let initialized = false;

const sanitizeEvent: NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSend'] = (event) => {
  delete event.user;
  return event;
};

export function initErrorMonitoring() {
  if (initialized || !ENV.sentryEnabled || !ENV.sentryDsn) {
    return;
  }

  const options: Parameters<typeof Sentry.init>[0] = {
    dsn: ENV.sentryDsn,
    environment: ENV.appEnv,
    release: `purrivacyapp@${ENV.appVersion}`,
    dist: ENV.appBuildVersion ?? undefined,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    enableAutoSessionTracking: true,
    beforeSend: sanitizeEvent,
    initialScope: {
      tags: {
        app: 'purrivacyapp',
      },
    },
  };

  if (ENV.sentryTracesSampleRate > 0) {
    options.tracesSampleRate = ENV.sentryTracesSampleRate;
  }

  Sentry.init(options);
  initialized = true;
}

export function captureAppError(error: unknown, context?: Record<string, unknown>) {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

export function wrapWithErrorMonitoring<TProps extends object>(
  Component: React.ComponentType<TProps>,
): React.ComponentType<TProps> {
  if (!ENV.sentryEnabled || !ENV.sentryDsn) {
    return Component;
  }

  return Sentry.wrap(Component as React.ComponentType<Record<string, unknown>>) as React.ComponentType<TProps>;
}

