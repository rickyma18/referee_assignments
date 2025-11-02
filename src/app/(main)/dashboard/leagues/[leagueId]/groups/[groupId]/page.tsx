"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import RoleGate from "@/components/auth/role-gate";
import { GroupForm } from "../_components/group-form";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getLeagueGroupAction } from "@/server/actions/league-groups.actions";

export default function EditLeagueGroupPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();

  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [initial, setInitial] = React.useState<{
    id: string;
    leagueId: string;
    name: string;
    season: string;
    order?: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getLeagueGroupAction(leagueId, groupId);
        setInitial(
          data
            ? {
                id: data.id,
                leagueId,
                name: data.name,
                season: data.season,
                order: data.order ?? 0,
              }
            : null,
        );
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
        <GroupForm leagueId={leagueId} initial={initial} />
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
