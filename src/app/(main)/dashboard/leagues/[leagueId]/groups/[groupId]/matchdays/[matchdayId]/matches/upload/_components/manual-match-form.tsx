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
import { createMatchAction } from "@/server/actions/matches.actions";

const schema = z.object({
  homeTeamId: z.string().min(1, "Requerido"),
  awayTeamId: z.string().min(1, "Requerido"),
  venueId: z.string().min(1, "Requerido"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm"),
});

type FormValues = z.infer<typeof schema>;

type TeamOpt = {
  id: string;
  name: string;
  // nuevos campos que puede mandar la API:
  stadium?: string; // nombre de estadio guardado en team
  defaultVenueId?: string; // resuelto en server (si existe en /venues)
  defaultVenueName?: string; // opcional
};

type VenueOpt = { id: string; name: string };

export function ManualMatchForm({
  leagueId,
  groupId,
  matchdayId,
  matchdayNumber,
  userId,
}: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber?: number;
  userId: string;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      homeTeamId: "",
      awayTeamId: "",
      venueId: "",
      fecha: "",
      hora: "",
    },
  });

  const [teams, setTeams] = React.useState<TeamOpt[]>([]);
  const [venues, setVenues] = React.useState<VenueOpt[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const url = `/api/catalogs/teams-and-venues?leagueId=${encodeURIComponent(leagueId)}&groupId=${encodeURIComponent(groupId)}`;
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

  // Cuando cambia el local, intentamos setear venueId por defecto
  const homeTeamId = form.watch("homeTeamId");
  React.useEffect(() => {
    if (!homeTeamId) return;
    const team = teams.find((t) => t.id === homeTeamId);
    if (!team) return;

    // 1) si el server ya resolvió defaultVenueId -> úsalo
    if (team.defaultVenueId) {
      if (form.getValues("venueId") !== team.defaultVenueId) {
        form.setValue("venueId", team.defaultVenueId, { shouldDirty: true });
      }
      return;
    }

    // 2) si no hay defaultVenueId, intenta matchear por nombre (stadium o defaultVenueName)
    const targetName = team.defaultVenueName ?? team.stadium;
    if (!targetName) return;

    const v = venues.find((x) => sameName(x.name, targetName));
    if (v && form.getValues("venueId") !== v.id) {
      form.setValue("venueId", v.id, { shouldDirty: true });
    }
  }, [homeTeamId, teams, venues, form, sameName]);

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
        toast.success("Partido creado correctamente");
        form.reset();
      } else {
        toast.error(r.message ?? "No se pudo crear el partido");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al crear partido");
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-sm">
        Al elegir el equipo local, seleccionamos la sede predeterminada automáticamente (si existe en el catálogo).
      </div>
      <Separator />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  {/* 👇 Hint mostrando el estadio declarado en el team */}
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
                    {teams.map((t) => (
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

          <FormField
            control={form.control}
            name="fecha"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha</FormLabel>
                <FormControl>
                  <Input type="date" placeholder="YYYY-MM-DD" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hora"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hora</FormLabel>
                <FormControl>
                  <Input type="time" placeholder="HH:mm" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="venueId"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Sede</FormLabel>
                <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
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
            <Button type="submit">Guardar partido</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
