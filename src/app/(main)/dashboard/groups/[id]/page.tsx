"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import RoleGate from "@/components/auth/role-gate";
import { GroupForm } from "../_components/group-form";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";

export default function EditGroupPage() {
  // Toma ambos por si tu carpeta es [groupId] o [id]
  const params = useParams<Record<string, string>>();
  const leagueId = String(params.leagueId);
  const groupId = String(params.groupId ?? params.id); // fallback

  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [initial, setInitial] = React.useState<{ id?: string; name?: string; season?: string } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ ahora pasamos leagueId y groupId como requiere la action
        const data = await getGroupAction(leagueId, groupId);

        setInitial(data ? { id: data.id, name: data.name, season: data.season } : null);
      } catch (e: any) {
        setError(e?.message ?? "Error al cargar el grupo");
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId, groupId]);

  return (
    <RoleGate require="VIEW_DESIGNS">
      {loading ? (
        <div className="p-6 text-sm opacity-70">Cargando…</div>
      ) : error ? (
        <div className="space-y-2 p-6">
          <p className="text-sm">Error: {error}</p>
          <Link className="text-sm underline" href={`/dashboard/leagues/${leagueId}/groups`}>
            Volver
          </Link>
        </div>
      ) : !initial ? (
        <div className="space-y-2 p-6">
          <p className="text-sm">Grupo no encontrado.</p>
          <Link className="text-sm underline" href={`/dashboard/leagues/${leagueId}/groups`}>
            Volver
          </Link>
        </div>
      ) : canEdit ? (
        <GroupForm initial={initial} />
      ) : (
        <div className="space-y-2 p-6">
          <p className="text-sm">No tienes permisos para editar grupos.</p>
          <Link className="text-sm underline" href={`/dashboard/leagues/${leagueId}/groups`}>
            Volver
          </Link>
        </div>
      )}
    </RoleGate>
  );
}
