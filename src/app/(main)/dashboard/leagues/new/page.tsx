"use client";

import Link from "next/link";
import RoleGate from "@/components/auth/role-gate";
import { useCurrentUser } from "@/hooks/use-current-user";
import { LeagueForm } from "../_components/league-form";

export default function NewLeaguePage() {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  return (
    <RoleGate require="VIEW_DESIGNS">
      {canEdit ? (
        <LeagueForm />
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
