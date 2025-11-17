// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/[matchId]/edit/_client-form.tsx
"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { updateMatchAction } from "@/server/actions/matches.actions";

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

type HeaderContext = {
  leagueName: string;
  season?: string | null;
  groupName?: string | null;
  matchdayNumber?: number | null;
  leagueLogoUrl?: string | null;
  leagueColorHex?: string | null;
  matchdayStart?: Date | string | null;
  matchdayEnd?: Date | string | null;
};

type Props = {
  initial: {
    id: string;
    leagueId: string;
    groupId: string;
    matchdayId: string;
    matchId: string;

    homeTeamId: string;
    awayTeamId: string;
    venueId: string;

    homeTeamName: string;
    awayTeamName: string;

    venueName: string;
    status: string;
    homeGoals: number | "";
    awayGoals: number | "";
    fecha: string;
    hora: string;
  };
  header?: HeaderContext;
};

const QUICK_HOURS = ["10:00", "12:00", "16:00", "20:00"] as const;

export default function EditMatchForm({ initial, header }: Props) {
  const router = useRouter();

  // ======== Ventana de jornada (para validar fecha) =========
  const startISO = React.useMemo(() => {
    if (!header?.matchdayStart) return "";
    const d = header.matchdayStart instanceof Date ? header.matchdayStart : new Date(header.matchdayStart);
    return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }, [header?.matchdayStart]);

  const endISO = React.useMemo(() => {
    if (!header?.matchdayEnd) return "";
    const d = header.matchdayEnd instanceof Date ? header.matchdayEnd : new Date(header.matchdayEnd);
    return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }, [header?.matchdayEnd]);

  // ======== Schema =========
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

  // ======== Form RHF =========
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      homeTeamId: initial.homeTeamId ?? "",
      awayTeamId: initial.awayTeamId ?? "",
      venueId: initial.venueId ?? "",
      fecha: initial.fecha ?? "",
      hora: initial.hora ?? "",
    },
    shouldUnregister: false,
  });

  const { isSubmitting } = form.formState;

  // ======== Catálogos =========
  const [teams, setTeams] = React.useState<TeamOpt[]>([]);
  const [venues, setVenues] = React.useState<VenueOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [useHomeDefaultVenue, setUseHomeDefaultVenue] = React.useState(false); // en edición, default en false

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const url = `/api/catalogs/teams-and-venues?leagueId=${encodeURIComponent(
          initial.leagueId,
        )}&groupId=${encodeURIComponent(initial.groupId)}`;
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
  }, [initial.leagueId, initial.groupId]);

  // Helper: compara nombres por lower+trim
  const sameName = React.useCallback((a?: string, b?: string) => {
    if (!a || !b) return false;
    return a.toLowerCase().trim() === b.toLowerCase().trim();
  }, []);

  // Autoselección de venue por equipo local cuando el switch está activo
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

  // ======== Marcador y estatus (fuera de RHF) =========
  const [status, setStatus] = React.useState(initial.status ?? "SCHEDULED");
  const [homeGoals, setHomeGoals] = React.useState<string>(initial.homeGoals === "" ? "" : String(initial.homeGoals));
  const [awayGoals, setAwayGoals] = React.useState<string>(initial.awayGoals === "" ? "" : String(initial.awayGoals));

  // ======== Header / ventana jornada para UI =========
  const backHref = React.useMemo(
    () => `/dashboard/leagues/${initial.leagueId}/groups/${initial.groupId}/matchdays/${initial.matchdayId}/matches`,
    [initial.leagueId, initial.groupId, initial.matchdayId],
  );

  const matchdayRangeLabel = React.useMemo(() => {
    if (!startISO && !endISO) return "Sin rango definido";
    if (startISO && endISO && startISO === endISO) return startISO;
    if (startISO && endISO) return `${startISO} → ${endISO}`;
    if (startISO) return `Desde ${startISO}`;
    if (endISO) return `Hasta ${endISO}`;
    return "Sin rango definido";
  }, [startISO, endISO]);

  async function onSubmit(values: FormValues) {
    try {
      if (values.homeTeamId === values.awayTeamId) {
        toast.error("Local y visitante no pueden ser iguales.");
        return;
      }

      const homeTeam = teams.find((t) => t.id === values.homeTeamId);
      const awayTeam = teams.find((t) => t.id === values.awayTeamId);
      const venueOpt = venues.find((v) => v.id === values.venueId);

      if (!homeTeam || !awayTeam || !venueOpt) {
        toast.error("Equipo o sede inválidos.");
        return;
      }

      const parsedHome = homeGoals === "" ? null : Number(homeGoals);
      const parsedAway = awayGoals === "" ? null : Number(awayGoals);
      if (parsedHome !== null && isNaN(parsedHome)) {
        toast.error("Marcador local inválido.");
        return;
      }
      if (parsedAway !== null && isNaN(parsedAway)) {
        toast.error("Marcador visitante inválido.");
        return;
      }

      const res = await updateMatchAction({
        leagueId: initial.leagueId,
        groupId: initial.groupId,
        matchdayId: initial.matchdayId,
        matchId: initial.matchId,

        // datos de programación
        fecha: values.fecha || null,
        hora: values.hora || null,
        venueId: values.venueId,
        venueName: venueOpt.name,

        homeTeamId: values.homeTeamId,
        awayTeamId: values.awayTeamId,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,

        // marcador / estatus
        status,
        homeGoals: parsedHome,
        awayGoals: parsedAway,
      });

      if (!res?.ok) {
        throw new Error(res?.error ?? "No se pudo actualizar.");
      }

      toast.success("Partido actualizado.");
      router.push(backHref);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Error al actualizar.");
    }
  }

  return (
    <div className="space-y-4" aria-busy={isSubmitting}>
      {/* Header tipo UploadMatchesPage */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {header?.leagueLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={header.leagueLogoUrl}
                alt={`${header.leagueName} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center text-[10px]">
                Sin logo
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-xl leading-tight font-semibold">{header?.leagueName ?? "Liga"}</h1>

            <p className="text-muted-foreground text-sm">
              {header?.season && <span>Temporada {header.season}</span>}
              {header?.groupName && (
                <>
                  {" · "}
                  <span className="font-medium">{header.groupName}</span>
                </>
              )}
              {typeof header?.matchdayNumber === "number" && (
                <>
                  {" · "}
                  Jornada <b>{header.matchdayNumber}</b>
                </>
              )}
            </p>

            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
              <CalendarDays className="size-4" aria-hidden="true" />
              <span className="font-medium">Ventana:</span>
              <span className="font-mono">{matchdayRangeLabel}</span>
            </div>

            {header?.leagueColorHex ? (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span
                  className="inline-block size-4 rounded border"
                  style={{ backgroundColor: header.leagueColorHex ?? undefined }}
                  title={header.leagueColorHex ?? ""}
                />
                <span className="text-muted-foreground">Color liga:</span>
                <span className="font-mono">{header.leagueColorHex}</span>
              </div>
            ) : null}
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href={backHref}>Volver a partidos</Link>
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Editar partido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preview VS estilo ManualMatchForm */}
          <div className="rounded-xl border p-4 md:p-5">
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center">
                <div className="bg-muted h-14 w-14 overflow-hidden rounded-full">
                  {home?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={home.logoUrl} alt={home.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="mt-1 text-sm font-medium">{home?.name ?? initial.homeTeamName ?? "Local"}</span>
              </div>

              <span className="text-muted-foreground text-sm md:text-base">vs</span>

              <div className="flex flex-col items-center">
                <div className="bg-muted h-14 w-14 overflow-hidden rounded-full">
                  {away?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={away.logoUrl} alt={away.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="mt-1 text-sm font-medium">{away?.name ?? initial.awayTeamName ?? "Visitante"}</span>
              </div>
            </div>

            <div className="text-muted-foreground mt-3 grid gap-1 text-center text-xs md:text-sm" aria-live="polite">
              <span>{venue?.name ?? initial.venueName ?? "— Sede —"}</span>
              <span>
                {form.watch("fecha") || "—"} • {form.watch("hora") || "—"}
                {header?.matchdayNumber !== undefined && header?.matchdayNumber !== null ? (
                  <> • Jornada {header.matchdayNumber}</>
                ) : null}
              </span>
              {(startISO || endISO) && (
                <span>
                  Ventana de jornada: {startISO || "?"} → {endISO || "?"}
                </span>
              )}
            </div>
          </div>

          {/* Form igual que ManualMatchForm pero llamando updateMatchAction */}
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

              {/* Visitante */}
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

              {/* Botón intercambiar */}
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

              {/* Hora */}
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
                          onClick={() =>
                            form.setValue("hora", h, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        >
                          {h}
                        </Button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sede */}
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
                    <Select
                      disabled={loading || useHomeDefaultVenue}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
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

              {/* Marcador y estatus */}
              <div className="space-y-1.5">
                <FormLabel>Marcador local</FormLabel>
                <Input
                  inputMode="numeric"
                  placeholder="—"
                  value={homeGoals}
                  onChange={(e) => setHomeGoals(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <FormLabel>Marcador visitante</FormLabel>
                <Input
                  inputMode="numeric"
                  placeholder="—"
                  value={awayGoals}
                  onChange={(e) => setAwayGoals(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <FormLabel>Estatus</FormLabel>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona estatus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCHEDULED">Programado</SelectItem>
                    <SelectItem value="LIVE">En juego</SelectItem>
                    <SelectItem value="FINISHED">Finalizado</SelectItem>
                    {/* Si algún día quieres pospuesto:
                    <SelectItem value="POSTPONED">Pospuesto</SelectItem>
                    */}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 md:col-span-2">
                <Button type="button" variant="ghost" onClick={() => router.push(backHref)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
