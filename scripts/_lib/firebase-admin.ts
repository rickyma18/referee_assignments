import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config({ path: ".env.local" });

export function getAdminDb() {
  if (!getApps().length) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
      throw new Error("❌ Falta GOOGLE_APPLICATION_CREDENTIALS");
    }

    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf8"));

    const projectId =
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      serviceAccount.project_id ??
      process.env.GCLOUD_PROJECT;

    if (!projectId) {
      throw new Error("❌ No se pudo resolver projectId para Firebase Admin");
    }

    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  return getFirestore();
}
