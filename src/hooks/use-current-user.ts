// src/hooks/use-current-user.ts
"use client";

import { useEffect, useState } from "react";

import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { createSessionAction, clearSessionAction } from "@/server/auth/auth.actions";
import type { UserDoc } from "@/types/user";

// 👇 Importa las server actions tal cual

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
      // 🔻 LOGOUT o no hay usuario
      if (!fbUser) {
        try {
          // Limpia la cookie __session en el servidor
          await clearSessionAction();
        } catch {
          // en dev podemos ignorar errores silenciosamente
        }

        setState({ firebaseUser: null, userDoc: null, loading: false });
        return;
      }

      // 🔺 LOGIN o cambio de cuenta
      try {
        // Refresca el token del usuario actual
        const idToken = await fbUser.getIdToken(/* forceRefresh? false */);

        // Crea/actualiza la session cookie (__session) con ESTE usuario
        await createSessionAction(idToken);

        // Carga el doc de Firestore (roles, etc.)
        const snap = await getDoc(doc(db, "users", fbUser.uid));

        setState({
          firebaseUser: fbUser,
          userDoc: snap.exists() ? (snap.data() as UserDoc) : null,
          loading: false,
        });
      } catch (e) {
        console.error("[useCurrentUser] error syncing session", e);
        setState({ firebaseUser: fbUser, userDoc: null, loading: false });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
