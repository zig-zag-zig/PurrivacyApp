import * as admin from 'firebase-admin';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

if (!projectId) {
  throw new Error('[test] FIREBASE_PROJECT_ID or GCLOUD_PROJECT is required for Firebase emulator tests');
}

const app = admin.apps.length
  ? admin.app()
  : admin.initializeApp({
    projectId,
    ...(process.env.FIREBASE_DATABASE_URL ? { databaseURL: process.env.FIREBASE_DATABASE_URL } : {}),
  });

export const db = admin.firestore(app);
export const auth = admin.auth(app);
export const rtdb = admin.database(app);

db.settings({ ignoreUndefinedProperties: true });
