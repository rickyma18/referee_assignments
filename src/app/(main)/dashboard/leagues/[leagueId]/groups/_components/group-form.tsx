"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";

import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import { createLeagueGroupAction, updateLeagueGroupAction } from "@/server/actions/league-groups.actions";

type Props = {
  leagueId: string; // 👈 obligatorio ahora
  initial?: { id: string; name: string; season: string; order?: number } | null;
};

export function GroupForm({ leagueId, initial }: Props) {
  const router = useRouter();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [name, setName] = React.useState(initial?.name ?? "");
  const [season, setSeason] = React.useState(initial?.season ?? "");
  const [order, setOrder] = React.useState<number>(initial?.order ?? 0);
  const [saving, setSaving] = React.useState(false);

  const onSubmit = async () => {
    if (!canEdit) {
      toast.error("No tienes permisos para guardar.");
      return;
    }
    try {
      setSaving(true);

      if (initial?.id) {
        // Update
        const payload = GroupUpdateSchema.parse({
          id: initial.id,
          leagueId,
          name,
          season,
          order,
        });
        await updateLeagueGroupAction(payload);
        toast.success("Grupo actualizado");
      } else {
        // Create
        const payload = GroupCreateSchema.parse({
          leagueId,
          name,
          season,
          order,
        });
        await createLeagueGroupAction(payload);
        toast.success("Grupo creado");
      }

      router.push(`/dashboard/leagues/${leagueId}/groups`);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4 p-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Nombre</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grupo 13" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Temporada</label>
        <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025-26" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Orden (opcional)</label>
        <Input
          type="number"
          value={Number.isFinite(order) ? String(order) : ""}
          onChange={(e) => setOrder(Number(e.target.value) || 0)}
          placeholder="0"
        />
      </div>

      <div className="flex gap-2">
        <Button disabled={saving || !canEdit} onClick={onSubmit}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => history.back()}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
