// src/data/users.ts
import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { userConverter } from "@/lib/firestore-converters";
import { DEFAULT_ROLE, type UserDoc } from "@/types/user";

/**
 * Remueve claves con valor undefined de un objeto.
 * Firestore no acepta undefined, solo null.
 */
function stripUndefined<T extends object>(obj: T): { [K in keyof T]?: T[K] } {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function userDocRef(uid: string) {
  return doc(db, "users", uid).withConverter(userConverter);
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(userDocRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function upsertUserDoc(payload: Partial<UserDoc> & { uid: string; email: string }) {
  const now = Date.now();
  const prev = await getUserDoc(payload.uid);

  const docToWrite: UserDoc = {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName ?? prev?.displayName ?? null,
    photoURL: payload.photoURL ?? prev?.photoURL ?? null,
    role: (payload as any).role ?? prev?.role ?? DEFAULT_ROLE,
    scope: payload.scope ?? prev?.scope ?? null,
    // delegateId: solo actualizar si viene en payload, sino mantener previo
    delegateId: payload.delegateId ?? prev?.delegateId,
    // allowedDelegateIds: solo actualizar si viene en payload, sino mantener previo
    allowedDelegateIds: payload.allowedDelegateIds ?? prev?.allowedDelegateIds,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };

  // Strip undefined keys antes de enviar a Firestore (Firestore no acepta undefined)
  const sanitized = stripUndefined(docToWrite);

  await setDoc(userDocRef(payload.uid), sanitized, { merge: true });
  return docToWrite;
}
