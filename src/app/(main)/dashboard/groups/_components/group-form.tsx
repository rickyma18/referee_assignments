"use client";

import * as React from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { GroupCreateSchema } from "@/domain/groups/group.zod";
import { createGroupAction, updateGroupAction } from "@/server/actions/groups.actions";
import { useCurrentUser } from "@/hooks/use-current-user";

type Props = { initial?: { id?: string; name?: string; season?: string } };

export function GroupForm({ initial }: Props) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [season, setSeason] = React.useState(initial?.season ?? "");
  const [saving, setSaving] = React.useState(false);
  const router = useRouter();

  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;

  const onSubmit = async () => {
    try {
      setSaving(true);
      const data = GroupCreateSchema.parse({ name, season });

      if (initial?.id) {
        await updateGroupAction({ id: initial.id, ...data }, role); // 🔑 pasa role
        toast.success("Grupo actualizado");
      } else {
        await createGroupAction(data, role); // 🔑 pasa role
        toast.success("Grupo creado");
      }

      router.push("/dashboard/groups");
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
