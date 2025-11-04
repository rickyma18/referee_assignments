// =============================
// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/page.tsx
// =============================
"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { GroupForm } from "../_components/group-form";
import { getGroupAction } from "@/server/actions/groups.actions";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function EditGroupPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [initial, setInitial] = React.useState<{ id?: string; name?: string; season?: string } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const item = await getGroupAction(String(leagueId), String(groupId));
      setInitial(item ? { id: item.id, name: item.name, season: item.season } : null);
      setLoading(false);
    })();
  }, [leagueId, groupId]);

  if (loading) return <div className="p-6">Cargando...</div>;
  if (!initial) return <div className="p-6">No encontrado</div>;

  // 🔒 Gate de UI: árbitro no puede editar
  if (!canEdit) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-xl font-semibold">Editar grupo</h1>
        <p className="text-muted-foreground text-sm">No tienes permisos para editar grupos.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Editar grupo</h1>
      <GroupForm leagueId={String(leagueId)} initial={initial} />
    </div>
  );
}
