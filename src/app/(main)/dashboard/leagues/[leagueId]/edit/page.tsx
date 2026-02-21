// src/app/(main)/dashboard/leagues/[leagueId]/edit/page.tsx
"use client";

import * as React from "react";

import { useParams } from "next/navigation";

import { toast } from "sonner";

import { useCurrentUser } from "@/hooks/use-current-user";
import { getLeagueAction } from "@/server/actions/leagues.actions";

import { LeagueForm } from "../../_components/league-form";

export default function EditLeaguePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [initial, setInitial] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const data = await getLeagueAction(String(leagueId));
        setInitial(data ?? null);
      } catch (e: any) {
        toast.error(e?.message ?? "No se pudo cargar la liga");
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId]);

  if (loading) return <div className="p-6">Cargando...</div>;
  if (!initial) return <div className="p-6">Liga no encontrada</div>;

  return (
    <LeagueForm
      initial={initial}
      canEdit={canEdit}
      afterSaveHref={`/dashboard/leagues/${leagueId}`} // ← redirige al detalle
    />
  );
}
