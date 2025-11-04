// src/app/(main)/dashboard/leagues/_components/league-form.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { createLeagueAction, updateLeagueAction } from "@/server/actions/leagues.actions";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Props = {
  initial?: any;
  /** Deshabilita inputs y submit si el usuario no puede editar */
  canEdit?: boolean;
  /** Redirección tras guardar. Default: "/dashboard/leagues" */
  afterSaveHref?: string;
};

function slugify(name: string, season: string) {
  return `${name}-${season}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function LeagueForm({ initial, canEdit = true, afterSaveHref }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  // Usa el schema correcto según modo
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
      slug: initial?.slug, // lo recalculamos abajo si no viene
    },
    mode: "onTouched",
  });

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (loading) return;
    setLoading(true);
    setServerError(null);

    try {
      const autoSlug = initial?.slug && isEdit ? (initial.slug as string) : slugify(values.name, values.season);

      const payload = isEdit ? { ...values, id: initial.id, slug: autoSlug } : { ...values, slug: autoSlug };
      const action = isEdit ? updateLeagueAction : createLeagueAction;

      const res = await action(payload);

      // Si tus actions devuelven {ok:false, fieldErrors, message}
      if (res?.ok === false) {
        if (res.fieldErrors) {
          Object.entries(res.fieldErrors).forEach(([field, msg]) => {
            form.setError(field as any, { message: String(msg) });
          });
        }
        if (res.message) setServerError(res.message);
        return;
      }

      // Redirige al detalle si te lo pasaron; si no, a la lista
      router.push(afterSaveHref ?? "/dashboard/leagues");
    } catch (err: any) {
      setServerError(err?.message ?? "Ocurrió un error al guardar.");
    } finally {
      setLoading(false);
    }
  };

  // Deshabilitar por permisos o mientras guarda
  const disabled = !canEdit || loading;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">{isEdit ? "Editar liga" : "Crear liga"}</h1>

      {/* Banner de error del servidor */}
      {serverError && (
        <div className={cn("rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700")}>{serverError}</div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre" {...field} disabled={disabled} />
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

            {/* Color con etiqueta a la izquierda */}
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
                      />
                    </FormControl>
                    <span className="text-sm tabular-nums">{field.value}</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Región (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Región" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" disabled={disabled}>
            {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear liga"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
