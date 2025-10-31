// src/data/users.ts
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { userConverter } from "@/lib/firestore-converters";
import type { UserDoc } from "@/types/user";
import { DEFAULT_ROLE } from "@/types/user";

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
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(userDocRef(payload.uid), docToWrite, { merge: true });
  return docToWrite;
}
