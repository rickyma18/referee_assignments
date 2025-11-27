// ============================================
// src/hooks/use-current-user.ts
// ============================================
"use client";

import { useEffect, useState } from "react";

import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { createSessionAction, clearSessionAction } from "@/server/auth/auth.actions";
import type { UserDoc } from "@/types/user";

type State = {
  firebaseUser: FirebaseUser | null;
  userDoc: UserDoc | null;
  loading: boolean;
};

export function useCurrentUser(): State {
  const [state, setState] = useState<State>({
    firebaseUser: null,
    userDoc: null,
    loading: true,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      // No hay sesión → limpiar cookie y fin
      if (!fbUser) {
        try {
          await clearSessionAction();
        } catch {
          /* ignore on dev */
        }

        setState({ firebaseUser: null, userDoc: null, loading: false });
        return;
      }

      // Sí hay sesión
      try {
        const idToken = await fbUser.getIdToken();

        // Actualizamos cookie __session
        await createSessionAction(idToken);

        // Leemos el userDoc (rol, permisos, foto, etc.)
        const snap = await getDoc(doc(db, "users", fbUser.uid));

        setState({
          firebaseUser: fbUser,
          userDoc: snap.exists() ? (snap.data() as UserDoc) : null,
          loading: false,
        });
      } catch (e) {
        console.error("[useCurrentUser] error:", e);
        setState({ firebaseUser: fbUser, userDoc: null, loading: false });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
