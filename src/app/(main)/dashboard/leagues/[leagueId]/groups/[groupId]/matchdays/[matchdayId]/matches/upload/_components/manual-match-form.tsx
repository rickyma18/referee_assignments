"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { createMatchAction } from "@/server/actions/matches.actions";

type TeamOpt = {
  id: string;
  name: string;
  logoUrl?: string;
  stadium?: string;
  defaultVenueId?: string;
  defaultVenueName?: string;
};

type VenueOpt = { id: string; name: string };

type FormValues = {
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
};

const QUICK_HOURS = ["10:00", "12:00", "16:00", "20:00"] as const;

export function ManualMatchForm({
  leagueId,
  groupId,
  matchdayId,
  matchdayNumber,
  userId,
  matchdayStart,
  matchdayEnd,
}: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber?: number;
  userId: string;
  matchdayStart?: Date | string;
  matchdayEnd?: Date | string;
}) {
  // ---- Ventana de jornada normalizada
  const startISO = React.useMemo(() => {
    if (!matchdayStart) return "";
    const d = matchdayStart instanceof Date ? matchdayStart : new Date(matchdayStart);
    return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }, [matchdayStart]);

  const endISO = React.useMemo(() => {
    if (!matchdayEnd) return "";
    const d = matchdayEnd instanceof Date ? matchdayEnd : new Date(matchdayEnd);
    return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }, [matchdayEnd]);

  // ---- Schema con validación de rango de jornada
  const schema = React.useMemo(
    () =>
      z.object({
        homeTeamId: z.string().min(1, "Requerido"),
        awayTeamId: z.string().min(1, "Requerido"),
        venueId: z.string().min(1, "Requerido"),
        fecha: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
          .refine((v) => !startISO || v >= startISO, `No antes de ${startISO}`)
          .refine((v) => !endISO || v <= endISO, `No después de ${endISO}`),
        hora: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm"),
      }),
    [startISO, endISO],
  );

  // ====== AUTOSAVE ROBUSTO ======
  // Clave única por liga/grupo/jornada
  const STORAGE_KEY = React.useMemo(
    () => `manual-match-form:${leagueId}:${groupId}:${matchdayId}`,
    [leagueId, groupId, matchdayId],
  );

  // 1) Lee storage *sincrónicamente* antes de crear useForm (evita la carrera)
  const initialValues = React.useMemo<FormValues>(() => {
    const base: FormValues = {
      homeTeamId: "",
      awayTeamId: "",
      venueId: "",
      fecha: startISO || "", // primer día de jornada
      hora: typeof window !== "undefined" ? (localStorage.getItem("lastHour") ?? "") : "",
    };
    if (typeof window === "undefined") return base;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw) as Partial<FormValues>;
      // base pisa a saved, así respetas la jornada nueva
      return { ...saved, ...base };
    } catch {
      return base;
    }
  }, [STORAGE_KEY, startISO]);

  // 2) Crea useForm con esos valores ya mezclados
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    shouldUnregister: false,
  });

  const { isSubmitting } = form.formState;
  // Si hay ventana de jornada y la fecha está vacía, prellenar con el primer día
  React.useEffect(() => {
    if (!startISO) return; // si no hay jornada, no hacemos nada

    const currentFecha = form.getValues("fecha");
    if (!currentFecha) {
      form.setValue("fecha", startISO, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [startISO, form]);

  // 3) Activa el autosave *después* del primer render (evita que guarde vacíos antes de restaurar)
  const autosaveReadyRef = React.useRef(false);
  React.useEffect(() => {
    autosaveReadyRef.current = true;
  }, []);

  // 4) Watch con debounce y guardia de "ready"
  const saveTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const sub = form.watch((values) => {
      if (!autosaveReadyRef.current) return;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        } catch (err) {
          // Intencionalmente vacío
        }
      }, 250);
    });
    return () => {
      sub.unsubscribe();
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [form, STORAGE_KEY]);
  // ====== /AUTOSAVE ROBUSTO ======

  const [teams, setTeams] = React.useState<TeamOpt[]>([]);
  const [venues, setVenues] = React.useState<VenueOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [useHomeDefaultVenue, setUseHomeDefaultVenue] = React.useState(true);

  // Catálogos
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const url = `/api/catalogs/teams-and-venues?leagueId=${encodeURIComponent(leagueId)}&groupId=${encodeURIComponent(
          groupId,
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (!mounted) return;

        if (!res.ok || !data?.ok) {
          throw new Error(data?.message ?? "No se pudieron cargar catálogos.");
        }

        setTeams((data.teams ?? []) as TeamOpt[]);
        setVenues((data.venues ?? []) as VenueOpt[]);
      } catch (e: any) {
        toast.error(e?.message ?? "No se pudieron cargar catálogos.");
        setTeams([]);
        setVenues([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [leagueId, groupId]);

  // Helper: compara nombres por lower+trim
  const sameName = React.useCallback((a?: string, b?: string) => {
    if (!a || !b) return false;
    return a.toLowerCase().trim() === b.toLowerCase().trim();
  }, []);

  // Autoselección de venue por equipo local (respetando switch)
  const homeTeamId = form.watch("homeTeamId");
  React.useEffect(() => {
    if (!useHomeDefaultVenue) return;
    if (!homeTeamId) return;
    const team = teams.find((t) => t.id === homeTeamId);
    if (!team) return;

    if (team.defaultVenueId) {
      if (form.getValues("venueId") !== team.defaultVenueId) {
        form.setValue("venueId", team.defaultVenueId, { shouldDirty: true });
      }
      return;
    }

    const targetName = team.defaultVenueName ?? team.stadium;
    if (!targetName) return;

    const v = venues.find((x) => sameName(x.name, targetName));
    if (v && form.getValues("venueId") !== v.id) {
      form.setValue("venueId", v.id, { shouldDirty: true });
    }
  }, [homeTeamId, teams, venues, form, sameName, useHomeDefaultVenue]);

  // Opciones de visitante: excluye al local
  const awayOptions = React.useMemo(
    () => teams.filter((t) => t.id !== form.watch("homeTeamId")),
    [teams, form.watch("homeTeamId")],
  );

  // Preview VS
  const home = teams.find((t) => t.id === form.watch("homeTeamId"));
  const away = teams.find((t) => t.id === form.watch("awayTeamId"));
  const venue = venues.find((v) => v.id === form.watch("venueId"));

  // Chequeo ligero de conflicto (opcional)
  const [conflict, setConflict] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    const fecha = form.getValues("fecha");
    const hora = form.getValues("hora");
    const venueId = form.getValues("venueId");
    if (!fecha || !hora || !venueId) {
      setConflict(null);
      return;
    }
    (async () => {
      try {
        const q = new URLSearchParams({ leagueId, groupId, matchdayId, venueId, fecha, hora });
        const res = await fetch(`/api/matches/conflicts?${q.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        setConflict(data?.conflictMatchId ? `Conflicto con partido ${data.conflictMatchId}` : null);
      } catch {
        if (active) setConflict(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [form.watch("fecha"), form.watch("hora"), form.watch("venueId"), leagueId, groupId, matchdayId, form]);

  async function onSubmit(values: FormValues) {
    try {
      if (values.homeTeamId === values.awayTeamId) {
        toast.error("Local y visitante no pueden ser iguales.");
        return;
      }

      const home = teams.find((t) => t.id === values.homeTeamId);
      const away = teams.find((t) => t.id === values.awayTeamId);
      const venue = venues.find((v) => v.id === values.venueId);

      if (!home || !away || !venue) {
        toast.error("Equipo o sede inválidos.");
        return;
      }

      const r = (await createMatchAction({
        leagueId,
        groupId,
        matchdayId,
        matchdayNumber: matchdayNumber ?? 0,
        homeTeamId: values.homeTeamId,
        awayTeamId: values.awayTeamId,
        venueId: values.venueId,
        venueName: venue.name,
        homeTeamName: home.name,
        awayTeamName: away.name,
        fecha: values.fecha,
        hora: values.hora,
        userId,
      })) as { ok: boolean; message?: string };

      if (r.ok) {
        if (typeof window !== "undefined" && values.hora) {
          localStorage.setItem("lastHour", values.hora);
        }
        localStorage.removeItem(STORAGE_KEY);

        toast.success("Partido creado correctamente");
        form.reset({
          homeTeamId: "",
          awayTeamId: "",
          venueId: "",
          fecha: startISO ?? "",
          hora: localStorage.getItem("lastHour") ?? "",
        });
      } else {
        toast.error(r.message ?? "No se pudo crear el partido");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al crear partido");
    }
  }

  return (
    <div className="space-y-4" aria-busy={isSubmitting}>
      <div className="text-muted-foreground text-sm">
        Al elegir el equipo local, seleccionamos la sede predeterminada automáticamente (si existe en el catálogo).
      </div>
      <Separator />

      {/* Preview VS */}
      <div className="rounded-xl border p-4 md:p-5">
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center">
            <div className="bg-muted h-14 w-14 overflow-hidden rounded-full">
              {home?.logoUrl ? <img src={home.logoUrl} alt={home.name} className="h-full w-full object-cover" /> : null}
            </div>
            <span className="mt-1 text-sm font-medium">{home?.name ?? "Local"}</span>
          </div>

          <span className="text-muted-foreground text-sm md:text-base">vs</span>

          <div className="flex flex-col items-center">
            <div className="bg-muted h-14 w-14 overflow-hidden rounded-full">
              {away?.logoUrl ? <img src={away.logoUrl} alt={away.name} className="h-full w-full object-cover" /> : null}
            </div>
            <span className="mt-1 text-sm font-medium">{away?.name ?? "Visitante"}</span>
          </div>
        </div>

        <div className="text-muted-foreground mt-3 grid gap-1 text-center text-xs md:text-sm" aria-live="polite">
          <span>{venue?.name ?? "— Sede —"}</span>
          <span>
            {form.watch("fecha") || "—"} • {form.watch("hora") || "—"}
            {matchdayNumber !== undefined ? <> • Jornada {matchdayNumber}</> : null}
          </span>
          {(startISO || endISO) && (
            <span>
              Ventana de jornada: {startISO || "?"} → {endISO || "?"}
            </span>
          )}
          {conflict && <span className="text-amber-600">{conflict}</span>}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Local */}
          <FormField
            control={form.control}
            name="homeTeamId"
            render={({ field }) => {
              const team = teams.find((t) => t.id === field.value);
              return (
                <FormItem>
                  <FormLabel>Local</FormLabel>
                  <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona equipo local" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {team?.stadium ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Sede del local: <span className="font-medium">{team.stadium}</span>
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Visitante (filtrado) */}
          <FormField
            control={form.control}
            name="awayTeamId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visitante</FormLabel>
                <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona equipo visitante" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {awayOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Botón Intercambiar */}
          <div className="md:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const h = form.getValues("homeTeamId");
                const a = form.getValues("awayTeamId");
                form.setValue("homeTeamId", a || "");
                form.setValue("awayTeamId", h || "");
              }}
            >
              Intercambiar equipos
            </Button>
          </div>

          {/* Fecha */}
          <FormField
            control={form.control}
            name="fecha"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    placeholder="YYYY-MM-DD"
                    min={startISO || undefined}
                    max={endISO || undefined}
                    {...field}
                  />
                </FormControl>
                {(startISO || endISO) && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Jornada: {startISO || "?"} → {endISO || "?"}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hora + quick picks */}
          <FormField
            control={form.control}
            name="hora"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hora</FormLabel>
                <FormControl>
                  <Input type="time" placeholder="HH:mm" {...field} />
                </FormControl>
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_HOURS.map((h) => (
                    <Button
                      key={h}
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => form.setValue("hora", h, { shouldDirty: true, shouldValidate: true })}
                    >
                      {h}
                    </Button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Sede + toggle usar sede del local */}
          <FormField
            control={form.control}
            name="venueId"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Sede</FormLabel>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Usar sede del local</span>
                    <Switch checked={useHomeDefaultVenue} onCheckedChange={(v) => setUseHomeDefaultVenue(v)} />
                  </div>
                </div>
                <Select disabled={loading || useHomeDefaultVenue} onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={venues.length ? "Selecciona sede" : "No hay sedes disponibles"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {venues.length === 0 ? (
                      <div className="text-muted-foreground px-3 py-2 text-sm">Sin sedes</div>
                    ) : (
                      venues.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar partido"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
