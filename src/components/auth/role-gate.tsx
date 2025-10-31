"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Can } from "@/lib/rbac";

type Props = { children: React.ReactNode; require?: "VIEW_DESIGNS" };
export default function RoleGate({ children, require = "VIEW_DESIGNS" }: Props) {
  const { userDoc, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const role = userDoc?.role ?? null;
    const ok = require === "VIEW_DESIGNS" ? Can.viewDesignaciones(role) : false;
    if (!ok) router.replace("/auth/login");
  }, [loading, userDoc, router, require]);

  if (loading) return null;
  return <>{children}</>;
}
