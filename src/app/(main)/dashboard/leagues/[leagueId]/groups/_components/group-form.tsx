// =============================
// src/app/(main)/dashboard/leagues/[leagueId]/groups/_components/group-form.tsx
// =============================
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import { createGroupAction, updateGroupAction } from "@/server/actions/groups.actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CreateSchema = GroupCreateSchema;
const UpdateSchema = GroupUpdateSchema;

type Initial = { id?: string; name?: string; season?: string };

export function GroupForm({ leagueId, initial }: { leagueId: string; initial?: Initial | null }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const [name, setName] = React.useState(initial?.name ?? "");
  const [season, setSeason] = React.useState(initial?.season ?? "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      if (!initial?.id) {
        const parsed = CreateSchema.parse({ leagueId, name, season });
        await createGroupAction(parsed);
        toast.success("Grupo creado");
      } else {
        const parsed = UpdateSchema.parse({ leagueId, id: initial.id, name, season });
        await updateGroupAction(parsed);
        toast.success("Grupo actualizado");
      }
      router.push(`/dashboard/leagues/${leagueId}/groups`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Grupo 13" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="season">Temporada</Label>
        <Input id="season" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025-26" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {initial?.id ? "Guardar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
