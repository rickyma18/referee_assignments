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
      // 🔴 No hay sesión en el cliente
      if (!fbUser) {
        try {
          // Limpia cookie __session del server (por si quedaba algo)
          await clearSessionAction();
        } catch {
          // ignore en dev
        }

        setState({
          firebaseUser: null,
          userDoc: null,
          loading: false,
        });
        return;
      }

      // ✅ Sí hay sesión en el cliente
      try {
        // Forzamos refresh del token para evitar usar algo viejo
        const idToken = await fbUser.getIdToken(true);

        // Sincroniza la cookie __session del server con este usuario
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

        // Al menos devolvemos el usuario de Firebase para que la UI no se quede colgada
        setState({
          firebaseUser: fbUser,
          userDoc: null,
          loading: false,
        });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
