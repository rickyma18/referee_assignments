"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import type { UserDoc, AppRole } from "@/types/user";

export function AuthGuard({ allowedRoles, children }: { allowedRoles: AppRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data() as UserDoc | undefined;

      if (!data || !data.active || !allowedRoles.includes(data.role)) {
        router.replace("/auth/login");
        return;
      }

      setAuthorized(true);
    });

    return () => unsub();
  }, [router, allowedRoles]);

  if (authorized === null) {
    return (
      <div className="text-muted-foreground flex h-screen items-center justify-center text-sm">
        Verificando acceso...
      </div>
    );
  }

  return <>{children}</>;
}
