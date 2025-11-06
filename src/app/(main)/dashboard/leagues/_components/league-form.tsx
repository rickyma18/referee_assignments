// src/app/(main)/dashboard/leagues/_components/league-form.tsx
"use client";

import * as React from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { cn } from "@/lib/utils";
import { createLeagueAction, updateLeagueAction } from "@/server/actions/leagues.actions";

// ===== Props =====
type Props = {
  initial?: any;
  /** Deshabilita inputs y submit si el usuario no puede editar */
  canEdit?: boolean;
  /** Redirección tras guardar. Default: "/dashboard/leagues" */
  afterSaveHref?: string;
};

// ===== Utils =====
function slugify(name: string, season: string) {
  return `${name}-${season}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ===== Component =====
export function LeagueForm({ initial, canEdit = true, afterSaveHref }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  // Schema dinámico por modo
  const schema = (isEdit ? LeagueUpdateSchema : LeagueCreateSchema) as unknown as z.ZodType<any>;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      season: initial?.season ?? "",
      color: initial?.color ?? "#0057FF",
      status: initial?.status ?? "ACTIVE",
      region: initial?.region ?? "",
      startDate: initial?.startDate ? new Date(initial.startDate) : undefined,
      endDate: initial?.endDate ? new Date(initial.endDate) : undefined,
      logoUrl: initial?.logoUrl ?? "",
      notes: initial?.notes ?? "",
      id: initial?.id, // para UpdateSchema
      slug: initial?.slug, // se recalcula abajo si no viene
    },
    mode: "onTouched",
  });

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // ===== UX: atajos y protección de cambios sin guardar =====
  const isDirty = form.formState.isDirty;

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isModS = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (isModS) {
        e.preventDefault();
        if (!loading && canEdit) form.handleSubmit(onSubmit)();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canEdit]);

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // ===== Derivados para preview =====
  // ===== Derivados para preview =====
  const watchName = form.watch("name");
  const watchSeason = form.watch("season");
  const watchColor = form.watch("color");
  const watchLogo = form.watch("logoUrl");
  const liveSlug = React.useMemo(() => slugify(watchName ?? "", watchSeason ?? ""), [watchName, watchSeason]);

  // ✅ agrega estas dos líneas
  const displayName = (watchName ?? "").trim();
  const displaySeason = (watchSeason ?? "").trim();
  // ✅ normaliza a string vacío para evaluar "vacío" vs. null/undefined
  const nameForSubtitle = (displayName ?? "").trim();
  const seasonForSubtitle = (displaySeason ?? "").trim();

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const subtitleName = nameForSubtitle ? nameForSubtitle : "Nombre de la liga";
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const subtitleSeason = seasonForSubtitle ? seasonForSubtitle : "Temporada";

  // ===== Submit =====
  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (loading) return;
    setLoading(true);
    setServerError(null);

    try {
      const autoSlug = initial?.slug && isEdit ? (initial.slug as string) : slugify(values.name, values.season);
      const payload = isEdit ? { ...values, id: initial.id, slug: autoSlug } : { ...values, slug: autoSlug };
      const action = isEdit ? updateLeagueAction : createLeagueAction;

      const res = await action(payload);

      if (res?.ok === false) {
        if (res.fieldErrors) {
          Object.entries(res.fieldErrors).forEach(([field, msg]) => {
            form.setError(field as any, { message: String(msg) });
          });
        }
        if (res.message) setServerError(res.message);
        return;
      }

      router.push(afterSaveHref ?? "/dashboard/leagues");
    } catch (err: any) {
      setServerError(err?.message ?? "Ocurrió un error al guardar.");
    } finally {
      setLoading(false);
    }
  };

  // Deshabilitar por permisos o mientras guarda
  const disabled = !canEdit || loading;

  // ===== Helpers =====
  const validUrl = (u?: string) => {
    if (!u) return true;
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header con preview de liga */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          {/* Logo preview */}
          <div className="relative h-14 w-14 overflow-hidden rounded-xl ring-1 ring-black/10">
            {watchLogo && validUrl(watchLogo) ? (
              <Image src={watchLogo} alt="Logo liga" fill className="bg-white object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: watchColor }}>
                <span className="text-lg font-semibold text-white">{(watchName?.[0] ?? "L").toUpperCase()}</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isEdit ? "Editar liga" : "Crear liga"}</h1>

            <p className="text-muted-foreground text-sm">
              {subtitleName} • {subtitleSeason}
            </p>
          </div>
        </div>

        {/* Slug visible (solo lectura) */}
        <div className="text-muted-foreground text-xs select-all">
          <span className="bg-muted mr-2 rounded-full px-2 py-1">slug</span>
          <code>{initial?.slug ?? (liveSlug && liveSlug.length ? liveSlug : "(se generará)")}</code>
        </div>
      </div>

      {/* Banner de error del servidor */}
      {serverError && (
        <div className={cn("rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700")}>{serverError}</div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Campos principales */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Liga TDP" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="season"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporada</FormLabel>
                  <FormControl>
                    <Input placeholder="2025-26" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Color picker con preview del valor */}
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input
                        type="color"
                        className="h-10 w-16 cursor-pointer p-1"
                        value={field.value ?? "#0057FF"}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={disabled}
                        aria-label="Seleccionar color de la liga"
                      />
                    </FormControl>
                    <span className="text-sm tabular-nums">{field.value}</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Estado */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estatus</FormLabel>
                  <FormControl>
                    <select
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                      disabled={disabled}
                    >
                      <option value="ACTIVE">Activa</option>
                      <option value="ARCHIVED">Archivada</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Región */}
            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Región (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Jalisco / Occidente" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Logo URL con preview y validación simple */}
            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://cdn.ejemplo.com/ligas/tdp.png"
                      {...field}
                      onBlur={(e) => {
                        field.onBlur();
                        const val = e.target.value?.trim();
                        if (val && !validUrl(val)) {
                          form.setError("logoUrl" as any, { message: "URL inválida (usa http/https)" });
                        }
                      }}
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fechas (opcionales) */}
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fin (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notas */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Información adicional de la liga, reglamentos, contactos, etc."
                      {...field}
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Barra de acciones sticky para mejor UX en formularios largos */}
          <div className="bg-background/70 supports-[backdrop-filter]:bg-background/50 sticky bottom-0 z-10 -mx-6 border-t p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground text-xs">
                {isDirty ? "Cambios sin guardar" : "Todo sincronizado"} • Ctrl/Cmd + S para guardar
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" asChild disabled={loading}>
                  <Link href={afterSaveHref ?? "/dashboard/leagues"}>Cancelar</Link>
                </Button>
                <Button type="submit" disabled={disabled || (!form.formState.isValid && form.formState.isSubmitted)}>
                  {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear liga"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
