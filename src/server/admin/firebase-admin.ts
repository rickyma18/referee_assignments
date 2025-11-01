// src/server/admin/firebase-admin.ts
import { getApps, initializeApp, applicationDefault, cert, type AppOptions } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import fs from "node:fs";

declare global {
  // eslint-disable-next-line no-var
  var ADMIN_APP: ReturnType<typeof initializeApp> | undefined;
  // eslint-disable-next-line no-var
  var ADMIN_DB: Firestore | undefined;
}

function getCredential() {
  const jsonInline = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  if (jsonInline) {
    try {
      const parsed = JSON.parse(jsonInline);
      return cert(parsed);
    } catch {
      console.warn("GOOGLE_CLOUD_CREDENTIALS_JSON inválido (no es JSON).");
    }
  }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac && fs.existsSync(gac)) return applicationDefault();

  return applicationDefault();
}

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "referee-assignments";

const appOptions: AppOptions = { credential: getCredential(), projectId };

const adminApp = globalThis.ADMIN_APP || (getApps().length ? getApps()[0] : initializeApp(appOptions));

if (!globalThis.ADMIN_APP) globalThis.ADMIN_APP = adminApp;

export const adminDb: Firestore = globalThis.ADMIN_DB || getFirestore(adminApp);

if (!globalThis.ADMIN_DB) {
  adminDb.settings({ ignoreUndefinedProperties: true });
  globalThis.ADMIN_DB = adminDb;
}
