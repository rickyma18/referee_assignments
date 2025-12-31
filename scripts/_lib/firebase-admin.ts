import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminDb() {
  if (!getApps().length) {
    initializeApp(); // toma GOOGLE_APPLICATION_CREDENTIALS automáticamente
  }
  return getFirestore();
}
