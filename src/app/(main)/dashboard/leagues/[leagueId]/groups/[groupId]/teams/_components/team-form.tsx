"use client";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeamAction, updateTeamAction } from "@/server/actions/teams.actions";

type TeamInitial = {
  id?: string;
  name?: string;
  groupId?: string;
  municipality?: string;
  stadium?: string;
  venue?: string;
  logoUrl?: string | null;
};

type Props = {
  initial?: TeamInitial | null;
};

type FieldErrors = Record<string, string | string[] | undefined>;

// ✅ Componente fuera del render para evitar react/no-unstable-nested-components
const FieldError: React.FC<{ value?: string | string[] }> = ({ value }) => {
  if (!value) return null;
  return <p className="text-destructive mt-1 text-xs">{Array.isArray(value) ? value.join(", ") : value}</p>;
};

export function TeamForm({ initial }: Props) {
  const router = useRouter();
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();

  const isEdit = Boolean(initial?.id);

  const [form, setForm] = React.useState({
    name: initial?.name ?? "",
    municipality: initial?.municipality ?? "",
    stadium: initial?.stadium ?? "",
    venue: initial?.venue ?? "",
    logoUrl: initial?.logoUrl ?? "",
  });

  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const onChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((s) => ({ ...s, [field]: e.target.value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      if (isEdit && initial?.id) {
        const res = await updateTeamAction({
          id: initial.id,
          groupId, // permitido cambiar grupo más adelante si lo habilitas aquí
          name: form.name,
          municipality: form.municipality,
          stadium: form.stadium,
          venue: form.venue,
          logoUrl: form.logoUrl || undefined,
          leagueId, // para revalidate exacto
        });

        if (!res.ok) {
          if (res.fieldErrors) setErrors(res.fieldErrors as FieldErrors);
          toast.error(res.message ?? "No se pudo actualizar el equipo");
          return;
        }

        toast.success("Equipo actualizado");
        router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams`);
        // router.refresh();
      } else {
        const res = await createTeamAction({
          groupId,
          name: form.name,
          municipality: form.municipality,
          stadium: form.stadium,
          venue: form.venue,
          logoUrl: form.logoUrl || undefined,
          leagueId,
        });

        if (!res.ok) {
          if (res.fieldErrors) setErrors(res.fieldErrors as FieldErrors);
          toast.error(res.message ?? "No se pudo crear el equipo");
          return;
        }

        toast.success("Equipo creado");
        router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Nombre */}
      <div>
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          value={form.name}
          onChange={onChange("name")}
          placeholder="Ej. Club Deportivo Zapopan"
          required
        />
        <FieldError value={errors.name} />
      </div>

      {/* Municipio */}
      <div>
        <Label htmlFor="municipality">Municipio</Label>
        <Input
          id="municipality"
          value={form.municipality}
          onChange={onChange("municipality")}
          placeholder="Ej. Zapopan"
        />
        <FieldError value={errors.municipality} />
      </div>

      {/* Estadio */}
      <div>
        <Label htmlFor="stadium">Estadio</Label>
        <Input id="stadium" value={form.stadium} onChange={onChange("stadium")} placeholder="Ej. Estadio Municipal" />
        <FieldError value={errors.stadium} />
      </div>

      {/* Sede (dirección exacta) */}
      <div>
        <Label htmlFor="venue">Sede (dirección)</Label>
        <Input
          id="venue"
          value={form.venue}
          onChange={onChange("venue")}
          placeholder="Calle #, Colonia, CP, Ciudad, Estado"
        />
        <FieldError value={errors.venue} />
      </div>

      {/* Logo URL (editable) */}
      <div>
        <Label htmlFor="logoUrl">Logo URL (opcional)</Label>
        <Input
          id="logoUrl"
          value={form.logoUrl ?? ""}
          onChange={onChange("logoUrl")}
          placeholder="https://…/logo.png"
          type="url"
        />
        <FieldError value={errors.logoUrl} />
        <p className="text-muted-foreground mt-1 text-xs"></p>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            history.back();
          }}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear equipo"}
        </Button>
      </div>
    </form>
  );
}
