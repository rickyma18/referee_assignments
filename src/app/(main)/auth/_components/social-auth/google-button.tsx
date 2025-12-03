"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  fetchSignInMethodsForEmail,
  signOut,
  Auth,
} from "firebase/auth";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getUserDoc, upsertUserDoc } from "@/data/users";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { createSessionAction, clearSessionAction } from "@/server/auth/auth.actions";
import type { UserDoc } from "@/types/user";

type Props = React.ComponentProps<typeof Button>;

async function handleExistingEmail(auth: Auth, email: string) {
  const methods = await fetchSignInMethodsForEmail(auth, email);

  if (methods.includes("password")) {
    toast.error(
      "Ya hay una cuenta con correo y contraseña. Inicia sesión con email y contraseña y luego vincula Google desde tu cuenta.",
    );
    return;
  }

  toast.error("Tu correo ya está registrado con otro método de acceso.");
}

export function GoogleButton({ className, ...props }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const handleSignIn = async () => {
    try {
      setLoading(true);

      // Persistencia tipo "recordar"
      await setPersistence(auth, browserLocalPersistence);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      // 1) Login en Firebase (cliente)
      const result = await signInWithPopup(auth, provider);
      const { user } = result;

      // 2) Sincronizar sesión del SERVER (cookie __session)
      const idToken = await user.getIdToken(true);
      await createSessionAction(idToken);

      // 3) Obtener (o crear) el documento de usuario
      let doc: UserDoc | null = await getUserDoc(user.uid);

      if (!doc) {
        // upsert aplica DEFAULT_ROLE = 'ARBITRO' si no envías role
        await upsertUserDoc({
          uid: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? null,
          photoURL: user.photoURL ?? null,
        });

        doc = await getUserDoc(user.uid);
      }

      if (!doc) {
        // si algo falló al crear/leer el doc, limpiamos sesión para no dejar basura
        await signOut(auth);
        await clearSessionAction();
        toast.error("No se pudo inicializar tu perfil. Contacta al administrador.");
        return;
      }

      const role = doc.role; // 'SUPERUSUARIO' | 'DELEGADO' | 'ASISTENTE' | 'ARBITRO'
      const isActive = (doc as any).active ?? true; // si no existe, asumimos true

      if (!isActive) {
        // Usuario marcado como inactivo → limpiar todo
        await signOut(auth);
        await clearSessionAction();
        toast.error("Usuario inactivo. Contacta al administrador.");
        return;
      }

      // 4) Routing por rol (MAYÚSCULAS)
      switch (role) {
        case "SUPERUSUARIO":
          router.replace("/dashboard/default"); // Admin area
          break;
        case "DELEGADO":
          router.replace("/dashboard/assignments"); // CRUD designaciones
          break;
        case "ASISTENTE":
        case "ARBITRO":
          router.replace("/dashboard/assignments"); // vista read-only
          break;
        default:
          await signOut(auth);
          await clearSessionAction();
          toast.error("No tienes permisos para acceder.");
      }
    } catch (err: any) {
      const code = err?.code ?? "unknown";

      if (code === "auth/account-exists-with-different-credential") {
        const email = err?.customData?.email as string | undefined;

        if (email) {
          await handleExistingEmail(auth, email);
        } else {
          toast.error("Tu correo ya está registrado con otro método de acceso.");
        }
      } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // silencio: usuario cerró popup o doble click
      } else {
        toast.error(`No se pudo iniciar con Google. (${code})`);
        if (process.env.NODE_ENV === "development") {
          console.error("Google sign-in error:", err);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={cn("flex w-full items-center justify-center gap-2", className)}
      onClick={handleSignIn}
      disabled={loading}
      {...props}
    >
      {loading ? (
        "Conectando…"
      ) : (
        <>
          {/* Logo de Google inline */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.9 0 7.4 1.3 10.1 3.9l7.5-7.5C37.6 1.8 31.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l8.7 6.8C13.3 14.2 18.2 9.5 24 9.5z"
            />
            <path
              fill="#34A853"
              d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.6 3.2-2.5 5.9-5.4 7.8l8.4 6.5c4.9-4.5 7.7-11 7.7-18.8z"
            />
            <path
              fill="#4A90E2"
              d="M24 48c6.5 0 12-2.1 16-5.7l-8.4-6.5c-2.3 1.5-5.3 2.4-7.6 2.4-5.8 0-10.7-3.9-12.5-9.1l-8.7 6.8C6.4 42.6 14.6 48 24 48z"
            />
            <path
              fill="#FBBC05"
              d="M11.5 29.1c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-8.7-6.8C1 16.3 0 20 0 24s1 7.7 2.8 11.3l8.7-6.2z"
            />
          </svg>
          <span>Continuar con Google</span>
        </>
      )}
    </Button>
  );
}
