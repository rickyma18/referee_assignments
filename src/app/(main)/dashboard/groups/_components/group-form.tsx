// src/app/(main)/dashboard/groups/_components/group-form.tsx
"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import { createGroupAction, updateGroupAction } from "@/server/actions/groups.actions";

type Props = {
  leagueId: string; // ⬅️ requerido por los esquemas
  initial?: { id?: string; name?: string; season?: string } | null;
};

export function GroupForm({ leagueId, initial }: Props) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [season, setSeason] = React.useState(initial?.season ?? "");
  const [saving, setSaving] = React.useState(false);
  const router = useRouter();

  const isEdit = Boolean(initial?.id);

  const onSubmit = async () => {
    try {
      setSaving(true);

      if (isEdit) {
        const parsed = GroupUpdateSchema.parse({
          id: initial!.id, // existe porque isEdit === true
          leagueId,
          name,
          season,
        });
        await updateGroupAction(parsed); // ✅ un solo argumento
        toast.success("Grupo actualizado");
      } else {
        const parsed = GroupCreateSchema.parse({
          leagueId,
          name,
          season,
        });
        await createGroupAction(parsed); // ✅ un solo argumento
        toast.success("Grupo creado");
        setName("");
        setSeason("");
      }

      // Navegación: deja tu ruta preferida
      router.push("/dashboard/groups");
      router.refresh();
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

      <div className="flex gap-2">
        <Button disabled={saving} onClick={onSubmit}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => history.back()}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
