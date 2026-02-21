"use client";

import { useEffect, useState } from "react";

import { useRouter, usePathname } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";

import { getUserDoc } from "@/data/users";
import { auth } from "@/lib/firebase";
import type { UserRole } from "@/types/roles";
import type { UserDoc } from "@/types/user";

export function AuthGuard({ allowedRoles, children }: { allowedRoles: UserRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // 1) no sesión -> a login (si no estamos ya ahí)
      const isAuthRoute = pathname.startsWith("/auth");
      if (!user) {
        if (!isAuthRoute) router.replace("/auth/login");
        setAuthorized(false);
        return;
      }

      // 2) cargar doc
      const u = await getUserDoc(user.uid);
      if (!u) {
        router.replace("/auth/login");
        setAuthorized(false);
        return;
      }

      // 3) activo (opcional): si no existe, asumimos true
      const isActive = (u as any).active ?? true;

      // 4) rol permitido
      const ok = isActive && allowedRoles.includes(u.role);
      if (!ok) {
        router.replace("/unauthorized");
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
    });

    return () => unsub();
  }, [router, pathname, allowedRoles]);

  if (authorized === null) {
    return (
      <div className="text-muted-foreground flex h-screen items-center justify-center text-sm">
        Verificando acceso...
      </div>
    );
  }

  if (!authorized) return null;

  return <>{children}</>;
}
