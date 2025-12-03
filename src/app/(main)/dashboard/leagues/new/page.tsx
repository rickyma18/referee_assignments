// src/app/(main)/dashboard/leagues/new/page.tsx
"use client";

import Link from "next/link";

import RoleGate from "@/components/auth/role-gate";
import { useCurrentUser } from "@/hooks/use-current-user";

import { LeagueForm } from "../_components/league-form";

export default function NewLeaguePage() {
  const { userDoc, loading } = useCurrentUser();

  // 🔄 Mientras se resuelve el usuario/rol → loader chido
  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/FMF_Logo.png" alt="FMF Logo" className="h-20 w-20 animate-pulse object-contain opacity-90" />
        <div className="border-muted-foreground size-10 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Verificando permisos…</p>
      </div>
    );
  }

  // Ya tenemos userDoc, ahora sí calculamos el rol
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  return (
    <RoleGate require="VIEW_DESIGNS">
      {canEdit ? (
        <LeagueForm canEdit afterSaveHref="/dashboard/leagues" />
      ) : (
        <div className="space-y-2 p-6">
          <p className="text-sm">No tienes permisos para crear ligas.</p>
          <Link className="text-sm underline" href="/dashboard/leagues">
            Volver
          </Link>
        </div>
      )}
    </RoleGate>
  );
}
