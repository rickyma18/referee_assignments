"use client";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_ZONES } from "@/config/zones.constants";
import { createTeamAction, updateTeamAction } from "@/server/actions/teams.actions";

type Tier = "TRANQUILO" | "REGULARES" | "COMPLICADO" | "MUY_COMPLICADO";

type TeamInitial = {
  id?: string;
  name?: string;
  groupId?: string;
  municipality?: string;
  stadium?: string;
  venue?: string;
  logoUrl?: string | null;
  tier?: Tier | null;
  // Campos de travel (opcionales, pueden ser null)
  travelKmToLopezMateos?: number | null;
  travelCarMaxMinToLopezMateos?: number | null;
  travelPublicMaxMinToLopezMateos?: number | null;
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
    tier: (initial?.tier as Tier | null) ?? "REGULARES",
    // Campos de travel: string para el input, se convierte en server
    travelKmToLopezMateos: initial?.travelKmToLopezMateos?.toString() ?? "",
    travelCarMaxMinToLopezMateos: initial?.travelCarMaxMinToLopezMateos?.toString() ?? "",
    travelPublicMaxMinToLopezMateos: initial?.travelPublicMaxMinToLopezMateos?.toString() ?? "",
  });

  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  // 🔁 Ref del formulario para disparar submit desde el atajo
  const formRef = React.useRef<HTMLFormElement | null>(null);

  // 🔁 Zonas activas, ordenadas por "order"
  const zones = React.useMemo(
    () =>
      DEFAULT_ZONES.filter((z) => z.active)
        .sort((a, b) => a.order - b.order)
        .map((z) => ({ id: z.id, name: z.name })),
    [],
  );

  const onChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((s) => ({ ...s, [field]: e.target.value }));
  };

  const onChangeMunicipality = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((s) => ({ ...s, municipality: value }));
  };

  const onChangeTier = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Tier;
    setForm((s) => ({ ...s, tier: value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // 🔒 Validación rápida en cliente para estadio
    if (!form.stadium.trim()) {
      setErrors((prev) => ({ ...prev, stadium: "El estadio es obligatorio" }));
      toast.error("El estadio es obligatorio");
      setLoading(false);
      return;
    }

    try {
      if (isEdit && initial?.id) {
        const res = await updateTeamAction({
          id: initial.id,
          groupId,
          name: form.name,
          municipality: form.municipality,
          stadium: form.stadium,
          venue: form.venue,
          logoUrl: form.logoUrl || undefined,
          leagueId,
          tier: form.tier ?? "REGULARES",
          // Campos de travel (Zod preprocess convierte "" -> undefined/null)
          travelKmToLopezMateos: form.travelKmToLopezMateos as any,
          travelCarMaxMinToLopezMateos: form.travelCarMaxMinToLopezMateos as any,
          travelPublicMaxMinToLopezMateos: form.travelPublicMaxMinToLopezMateos as any,
        });

        if (!res.ok) {
          if (res.fieldErrors) setErrors(res.fieldErrors as FieldErrors);
          toast.error(res.message ?? "No se pudo actualizar el equipo");
          return;
        }

        toast.success("Equipo actualizado");
        router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams`);
      } else {
        const res = await createTeamAction({
          groupId,
          name: form.name,
          municipality: form.municipality,
          stadium: form.stadium,
          venue: form.venue,
          logoUrl: form.logoUrl || undefined,
          leagueId,
          tier: form.tier ?? "REGULARES",
          // Campos de travel (Zod preprocess convierte "" -> undefined/null)
          travelKmToLopezMateos: form.travelKmToLopezMateos as any,
          travelCarMaxMinToLopezMateos: form.travelCarMaxMinToLopezMateos as any,
          travelPublicMaxMinToLopezMateos: form.travelPublicMaxMinToLopezMateos as any,
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

  // 🔹 Atajo Ctrl+S / Cmd+S para guardar
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();

        if (loading) return;

        // Lanza el submit del formulario
        if (formRef.current) {
          formRef.current.requestSubmit();
          toast.info(isEdit ? "Guardando equipo…" : "Creando equipo…");
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, isEdit]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
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

      {/* Municipio / Zona (usando DEFAULT_ZONES) */}
      <div>
        <Label htmlFor="municipality">Municipio / Zona</Label>
        <select
          id="municipality"
          value={form.municipality}
          onChange={onChangeMunicipality}
          className="border-input bg-background focus-visible:ring-ring mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <option value="">Selecciona municipio / zona</option>
          {zones.map((z) => (
            <option key={z.id} value={z.name}>
              {z.name}
            </option>
          ))}
        </select>
        <FieldError value={errors.municipality} />
      </div>

      {/* Estadio (OBLIGATORIO) */}
      <div>
        <Label htmlFor="stadium">
          Estadio <span className="text-destructive">*</span>
        </Label>
        <Input
          id="stadium"
          value={form.stadium}
          onChange={onChange("stadium")}
          placeholder="Ej. Estadio Municipal"
          required
          minLength={3}
        />
        <FieldError value={errors.stadium} />
      </div>

      {/* Sede (dirección exacta) */}
      <div>
        <Label htmlFor="venue">Dirección</Label>
        <Input
          id="venue"
          value={form.venue}
          onChange={onChange("venue")}
          placeholder="Calle #, Colonia, CP, Ciudad, Estado"
        />
        <FieldError value={errors.venue} />
      </div>

      {/* Nivel / Tier del equipo */}
      <div>
        <Label htmlFor="tier">Nivel del equipo (Tier)</Label>
        <select
          id="tier"
          value={form.tier}
          onChange={onChangeTier}
          className="border-input bg-background focus-visible:ring-ring mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <option value="TRANQUILO">TRANQUILO (partidos sencillos)</option>
          <option value="REGULARES">REGULARES (equilibrados)</option>
          <option value="COMPLICADO">COMPLICADO (alto grado de dificultad)</option>
          <option value="MUY_COMPLICADO">MUY_COMPLICADO (máxima exigencia)</option>
        </select>
        <FieldError value={errors.tier} />
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

      {/* === Campos de Travel (opcionales) === */}
      <div className="border-border rounded-md border p-4">
        <h3 className="text-muted-foreground mb-3 text-sm font-medium">Datos de viaje a Lopez Mateos (opcional)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Distancia en km */}
          <div>
            <Label htmlFor="travelKmToLopezMateos">Distancia (km)</Label>
            <div className="relative">
              <Input
                id="travelKmToLopezMateos"
                type="number"
                min={0}
                max={1000}
                step="0.1"
                value={form.travelKmToLopezMateos}
                onChange={onChange("travelKmToLopezMateos")}
                placeholder="0"
                className="pr-10"
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                km
              </span>
            </div>
            <FieldError value={errors.travelKmToLopezMateos} />
          </div>

          {/* Tiempo en auto */}
          <div>
            <Label htmlFor="travelCarMaxMinToLopezMateos">Tiempo en auto (min)</Label>
            <div className="relative">
              <Input
                id="travelCarMaxMinToLopezMateos"
                type="number"
                min={0}
                max={1000}
                step="1"
                value={form.travelCarMaxMinToLopezMateos}
                onChange={onChange("travelCarMaxMinToLopezMateos")}
                placeholder="0"
                className="pr-10"
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                min
              </span>
            </div>
            <FieldError value={errors.travelCarMaxMinToLopezMateos} />
          </div>

          {/* Tiempo en transporte público */}
          <div>
            <Label htmlFor="travelPublicMaxMinToLopezMateos">Transporte publico (min)</Label>
            <div className="relative">
              <Input
                id="travelPublicMaxMinToLopezMateos"
                type="number"
                min={0}
                max={1000}
                step="1"
                value={form.travelPublicMaxMinToLopezMateos}
                onChange={onChange("travelPublicMaxMinToLopezMateos")}
                placeholder="Sin dato"
                className="pr-10"
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                min
              </span>
            </div>
            <FieldError value={errors.travelPublicMaxMinToLopezMateos} />
            <p className="text-muted-foreground mt-1 text-xs">Dejar vacio si no hay ruta</p>
          </div>
        </div>
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
