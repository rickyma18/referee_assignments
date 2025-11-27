"use client";

import * as React from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { getMatchdayByIdAction } from "@/server/actions/matchdays.actions";

import { ExcelUploader } from "./_components/excel-uploader";
import { ManualMatchForm } from "./_components/manual-match-form";

/** Helper seguro para convertir Firestore Timestamp/Date/string a Date */
function toDateClientSafe(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  if (typeof input === "number") {
    const ms = input < 10_000_000_000 ? input * 1000 : input;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === "string") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === "object") {
    const obj = input as any;

    if (typeof obj?.toDate === "function") {
      try {
        const d = obj.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch (err) {
        // Intencionalmente vacío
      }
    }

    const seconds =
      typeof obj?.seconds === "number" ? obj.seconds : typeof obj?.seconds === "number" ? obj.seconds : undefined;

    const nanos =
      typeof obj?.nanoseconds === "number"
        ? obj.nanoseconds
        : typeof obj?.nanoseconds === "number"
          ? obj.nanoseconds
          : 0;

    if (typeof seconds === "number") {
      const d = new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

/** Formatea un rango: 12–18 oct 2025 | 12 oct 2025 – 03 nov 2025, etc. */
function formatDateRange(start: Date | null, end: Date | null): string {
  const fmtShort = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (start && end) {
    // si mismo mes y año, usa día–día mes año
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      const dayStart = start.getDate().toString().padStart(2, "0");
      const dayEnd = end.getDate().toString().padStart(2, "0");
      const monthYear = new Intl.DateTimeFormat("es-MX", {
        month: "short",
        year: "numeric",
      }).format(start);
      return `${dayStart}–${dayEnd} ${monthYear}`;
    }
    return `${fmtShort.format(start)} – ${fmtShort.format(end)}`;
  }
  if (start && !end) {
    return `Desde ${fmtShort.format(start)}`;
  }
  if (!start && end) {
    return `Hasta ${fmtShort.format(end)}`;
  }
  return "Sin rango definido";
}

export default function UploadMatchesPage() {
  const { leagueId, groupId, matchdayId } = useParams<{
    leagueId: string;
    groupId: string;
    matchdayId: string;
  }>();

  const { userDoc, firebaseUser, loading: loadingUser } = useCurrentUser();

  const [matchdayNumber, setMatchdayNumber] = React.useState<number | null>(null);
  const [mdStart, setMdStart] = React.useState<Date | null>(null);
  const [mdEnd, setMdEnd] = React.useState<Date | null>(null);

  const [league, setLeague] = React.useState<any | null>(null);
  const [group, setGroup] = React.useState<any | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  const userId = firebaseUser?.uid ?? "";

  // cargar metadata (liga, grupo, jornada)
  React.useEffect(() => {
    let mounted = true;
    console.debug("[UploadMatchesPage] effect mounted");

    (async () => {
      try {
        console.time("[UploadMatchesPage] load meta");
        setMetaLoading(true);

        const [lg, grp, md] = await Promise.all([
          getLeagueAction(String(leagueId)),
          getGroupAction(String(leagueId), String(groupId)),
          getMatchdayByIdAction({
            leagueId: String(leagueId),
            groupId: String(groupId),
            matchdayId: String(matchdayId),
          }),
        ]);

        console.timeEnd("[UploadMatchesPage] load meta");
        if (!mounted) return;

        console.debug("[UploadMatchesPage] md raw:", md);

        setLeague(lg ?? null);
        setGroup(grp ?? null);

        if (md && md.ok === true) {
          const m = md.matchday as any;
          setMatchdayNumber(typeof m?.number === "number" ? m.number : null);

          const start = toDateClientSafe(m?.startDate);
          const end = toDateClientSafe(m?.endDate);

          console.debug("[UploadMatchesPage] parsed dates:", {
            start,
            end,
            rawStart: m?.startDate,
            rawEnd: m?.endDate,
          });

          setMdStart(start);
          setMdEnd(end);
        } else {
          setMatchdayNumber(null);
          setMdStart(null);
          setMdEnd(null);
        }
      } catch (err) {
        console.error("[UploadMatchesPage] meta load error:", err);
        if (mounted) {
          setLeague(null);
          setGroup(null);
          setMatchdayNumber(null);
          setMdStart(null);
          setMdEnd(null);
        }
      } finally {
        if (mounted) setMetaLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [leagueId, groupId, matchdayId]);

  // 🔄 Loader mientras todavía no tenemos user/rol
  if (loadingUser) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/FMF_Logo.png" alt="FMF Logo" className="h-20 w-20 animate-pulse object-contain opacity-90" />
        <div className="border-muted-foreground size-10 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Verificando permisos…</p>
      </div>
    );
  }

  // Ya con user cargado, ahora sí rol/permisos
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  if (!canEdit) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Cargar partidos</h1>
        <Separator />
        <Card>
          <CardContent className="py-6">No tienes permisos para cargar partidos.</CardContent>
        </Card>
      </div>
    );
  }

  const dateRangeLabel = formatDateRange(mdStart, mdEnd);
  const exactTooltip =
    mdStart || mdEnd
      ? [
          mdStart ? `Inicio: ${mdStart.toLocaleString("es-MX")}` : null,
          mdEnd ? `Fin: ${mdEnd.toLocaleString("es-MX")}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Header con logo y datos */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {league?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={league.logoUrl}
                alt={`${league.name} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : metaLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center text-[10px]">
                Sin logo
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-xl leading-tight font-semibold">
              {metaLoading ? "Cargando…" : (league?.name ?? "—")}
            </h1>

            {/* Subtítulo (temporada • grupo • jornada) */}
            <p className="text-muted-foreground text-sm">
              {league?.season && <span>Temporada {league.season}</span>}
              {group?.name && (
                <>
                  {" · "}
                  <span className="font-medium">{group.name}</span>
                </>
              )}
              {typeof matchdayNumber === "number" && (
                <>
                  {" · "}
                  Jornada <b>{matchdayNumber}</b>
                </>
              )}
            </p>

            {/* Ventana de jornada */}
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs" title={exactTooltip}>
              <CalendarDays className="size-4" aria-hidden="true" />
              <span className="font-medium">Ventana:</span>
              <span className="font-mono">{metaLoading ? "Cargando…" : dateRangeLabel}</span>
            </div>

            {/* Color de la liga (opcional) */}
            {league?.color ? (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span
                  className="inline-block size-4 rounded border"
                  style={{ backgroundColor: league.color ?? undefined }}
                  title={league.color ?? ""}
                />
                <span className="text-muted-foreground">Color liga:</span>
                <span className="font-mono">{league.color}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Botón volver a jornadas */}
        <Button asChild variant="outline">
          <Link href={`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays/${matchdayId}/matches`}>
            Volver a partidos
          </Link>
        </Button>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="manual" className="w-full">
        <TabsList>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="excel">Desde Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Alta manual de partido</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualMatchForm
                leagueId={String(leagueId)}
                groupId={String(groupId)}
                matchdayId={String(matchdayId)}
                matchdayNumber={matchdayNumber ?? undefined}
                userId={userId}
                matchdayStart={mdStart ?? undefined}
                matchdayEnd={mdEnd ?? undefined}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excel" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Importación desde Excel</CardTitle>
            </CardHeader>
            <CardContent>
              <ExcelUploader
                leagueId={String(leagueId)}
                groupId={String(groupId)}
                matchdayId={String(matchdayId)}
                matchdayNumber={matchdayNumber ?? 0}
                userId={userId}
                maxRows={2000}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
