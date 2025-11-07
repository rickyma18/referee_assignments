// =============================
// src/server/admin/firebase-admin.ts
// =============================
import fs from "node:fs";

import { getApps, initializeApp, applicationDefault, cert, type AppOptions } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth"; // ⬅️ NUEVO
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";

declare global {
  // eslint-disable-next-line no-var
  var ADMIN_APP: ReturnType<typeof initializeApp> | undefined;
  // eslint-disable-next-line no-var
  var ADMIN_DB: Firestore | undefined;
  // eslint-disable-next-line no-var
  var ADMIN_AUTH: Auth | undefined; // ⬅️ NUEVO
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

const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "referee-assignments";
const appOptions: AppOptions = { credential: getCredential(), projectId };

// --- App (usa ?? y ??=) ---
const adminApp = globalThis.ADMIN_APP ?? (getApps().length ? getApps()[0] : initializeApp(appOptions));
globalThis.ADMIN_APP ??= adminApp;

// --- Firestore (usa ?? y ??=) ---
const dbInstance: Firestore = globalThis.ADMIN_DB ?? getFirestore(adminApp);
// Aseguramos la configuración (repetirla no rompe nada)
dbInstance.settings({ ignoreUndefinedProperties: true });
globalThis.ADMIN_DB ??= dbInstance;
export const adminDb: Firestore = dbInstance;

// --- Auth (usa ?? y ??=) ---
const authInstance: Auth = globalThis.ADMIN_AUTH ?? getAuth(adminApp);
globalThis.ADMIN_AUTH ??= authInstance;
export const adminAuth: Auth = authInstance;

// 👇 re-export de FieldValue para serverTimestamp, increment, etc.
export const AdminFieldValue = FieldValue;
