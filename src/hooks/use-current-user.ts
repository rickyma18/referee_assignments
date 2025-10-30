"use client";

import { useEffect, useState } from "react";

import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import type { UserDoc } from "@/types/user";

type State = {
  firebaseUser: FirebaseUser | null;
  userDoc: UserDoc | null;
  loading: boolean;
};

export function useCurrentUser(): State {
  const [state, setState] = useState<State>({ firebaseUser: null, userDoc: null, loading: true });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setState({ firebaseUser: null, userDoc: null, loading: false });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        setState({
          firebaseUser: fbUser,
          userDoc: snap.exists() ? (snap.data() as UserDoc) : null,
          loading: false,
        });
      } catch {
        setState({ firebaseUser: fbUser, userDoc: null, loading: false });
      }
    });
    return () => unsub();
  }, []);

  return state;
}
