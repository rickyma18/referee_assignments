"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import RoleGate from "@/components/auth/role-gate";
import { useCurrentUser } from "@/hooks/use-current-user";

import { GroupForm } from "../_components/group-form";

export default function NewGroupPage() {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const params = useParams<Record<string, string>>();
  const leagueId = String(params.leagueId ?? ""); // ⬅️ requerido por el form/esquema

  if (!leagueId) {
    // Si tu ruta actual no incluye leagueId, debes:
    // 1) mover esta página a /dashboard/leagues/[leagueId]/groups/new
    //    o
    // 2) agregar un combobox para elegir la liga y pasar ese valor al form
    return (
      <div className="space-y-2 p-6">
        <p className="text-sm">
          Falta el parámetro <code>leagueId</code> en la ruta.
        </p>
        <Link className="text-sm underline" href="/dashboard/leagues">
          Ir a Ligas
        </Link>
      </div>
    );
  }

  return (
    <RoleGate require="VIEW_DESIGNS">
      {canEdit ? (
        // ⬇️ PASA leagueId
        <GroupForm leagueId={leagueId} />
      ) : (
        <div className="space-y-2 p-6">
          <p className="text-sm">No tienes permisos para crear grupos.</p>
          <Link className="text-sm underline" href={`/dashboard/leagues/${leagueId}/groups`}>
            Volver
          </Link>
        </div>
      )}
    </RoleGate>
  );
}
