// src/app/(main)/dashboard/leagues/_components/league-form.tsx
"use client";

import * as React from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Copy } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  type LeagueFormValues = z.infer<typeof LeagueCreateSchema> | z.infer<typeof LeagueUpdateSchema>;

  const schema = isEdit ? LeagueUpdateSchema : LeagueCreateSchema;

  const form = useForm<LeagueFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      season: initial?.season ?? "",
      color: initial?.color ?? "#232730FF",
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
  const [slugCopied, setSlugCopied] = React.useState(false);

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
  const watchName = form.watch("name");
  const watchSeason = form.watch("season");
  const watchColor = form.watch("color");
  const watchLogo = form.watch("logoUrl");
  const watchRegion = form.watch("region");
  const watchStatus = form.watch("status");
  const watchStartDate = form.watch("startDate");
  const watchEndDate = form.watch("endDate");

  const liveSlug = React.useMemo(() => slugify(watchName ?? "", watchSeason ?? ""), [watchName, watchSeason]);

  const displayName = (watchName ?? "").trim();
  const displaySeason = (watchSeason ?? "").trim();
  const nameForSubtitle = (displayName ?? "").trim();
  const seasonForSubtitle = (displaySeason ?? "").trim();
  const subtitleName = nameForSubtitle ? nameForSubtitle : "Nombre de la liga";

  const subtitleSeason = seasonForSubtitle ? seasonForSubtitle : "Temporada";

  const effectiveSlug = initial?.slug ?? (liveSlug && liveSlug.length ? liveSlug : "");

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

  const handleCopySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(slug);
      setSlugCopied(true);
      setTimeout(() => setSlugCopied(false), 1500);
    } catch {
      // noop; si falla no rompemos nada
    }
  };

  // ===== Submit =====
  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (loading) return;
    setLoading(true);
    setServerError(null);

    try {
      const autoSlug = initial?.slug && isEdit ? (initial.slug as string) : slugify(values.name, values.season);
      const { delegateId, ...safeValues } = values as any;
      const payload = isEdit ? { ...safeValues, id: initial.id, slug: autoSlug } : { ...safeValues, slug: autoSlug };
      const action = isEdit ? updateLeagueAction : createLeagueAction;

      const res = await action(payload);

      if (res?.ok === false) {
        if (res.fieldErrors) {
          Object.entries(res.fieldErrors).forEach(([field, msg]) => {
            form.setError(field as any, { message: String(msg) });
          });
        }
        if (res.message) setServerError(res.message);
        // Aseguramos que el usuario vea el error
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      router.push(afterSaveHref ?? "/dashboard/leagues");
    } catch (err: any) {
      setServerError(err?.message ?? "Ocurrió un error al guardar.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  // Deshabilitar por permisos o mientras guarda
  const disabled = !canEdit || loading;

  const dirtyText = isDirty ? "Cambios sin guardar" : "Todo sincronizado";
  const hotkeyHint = isDirty ? " • Ctrl/Cmd + S para guardar" : "";

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

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] tracking-wide uppercase">
                {isEdit ? "Edición" : "Nueva liga"}
              </Badge>

              {watchStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] font-medium",
                    watchStatus === "ACTIVE" &&
                      "border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                    watchStatus === "ARCHIVED" &&
                      "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                  )}
                >
                  {watchStatus === "ACTIVE" ? "Activa" : "Archivada"}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-bold tracking-tight">
              {displayName ?? (isEdit ? "Liga sin nombre" : "Nueva liga")}
            </h1>

            <p className="text-muted-foreground text-sm">
              {subtitleSeason}
              {watchRegion && watchRegion.trim() ? ` • ${watchRegion.trim()}` : ""}
            </p>
          </div>
        </div>

        {/* Slug visible (solo lectura) con copiar */}
        <div className="text-muted-foreground flex max-w-xs items-center gap-2 text-xs">
          <span className="bg-muted mr-1 rounded-full px-2 py-1">slug</span>
          <code className="flex-1 truncate">{effectiveSlug ?? "(se generará al guardar)"}</code>

          {effectiveSlug && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleCopySlug(effectiveSlug)}
                    disabled={!effectiveSlug}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="sr-only">Copiar slug</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copiar slug</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {slugCopied && (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-300">Copiado</span>
          )}
        </div>
      </div>

      {/* Banner de solo lectura por permisos */}
      {!canEdit && (
        <div className="border-border bg-muted/50 text-muted-foreground rounded-md border px-3 py-2 text-xs">
          No tienes permisos para editar esta liga. Solo puedes ver la información.
        </div>
      )}

      {/* Banner de error del servidor */}
      {serverError && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40">
          <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">No se pudo guardar la liga</p>
            <p className="text-xs opacity-90">{serverError}</p>
          </div>
        </div>
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
                  <FormLabel>
                    Nombre <span className="text-destructive">*</span>
                  </FormLabel>
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
                  <FormLabel>
                    Temporada <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="2025-2026" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Color picker con preview del valor y edición manual */}
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
                        value={field.value ?? "#232730ff"}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={disabled}
                        aria-label="Seleccionar color de la liga"
                      />
                    </FormControl>
                    <Input
                      className="h-10 w-28 font-mono text-xs"
                      value={field.value ?? "#232730ff"}
                      onChange={(e) => field.onChange(e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Este color se usa en la cabecera y acentos visuales de la liga.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Estado con Select de shadcn */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estatus</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={disabled}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un estatus" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Activa</SelectItem>
                      <SelectItem value="ARCHIVED">Archivada</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <Input
                      placeholder="Ej. Jalisco / Occidente"
                      {...field}
                      value={field.value ?? ""} // 👈 fuerza string
                      disabled={disabled}
                    />
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
                  {watchStartDate && watchEndDate && watchEndDate < watchStartDate && (
                    <p className="mt-1 text-xs text-red-500">La fecha de fin debe ser posterior al inicio.</p>
                  )}
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
                      placeholder="Información adicional de la liga: reglamentos, contacto del delegado, observaciones, etc."
                      {...field}
                      value={field.value ?? ""} // 👈 evita null
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
                {dirtyText}
                {hotkeyHint}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" asChild disabled={loading}>
                  <Link href={afterSaveHref ?? "/dashboard/leagues"}>Cancelar</Link>
                </Button>

                {canEdit && (
                  <Button type="submit" disabled={disabled || (!form.formState.isValid && form.formState.isSubmitted)}>
                    {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear liga"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
