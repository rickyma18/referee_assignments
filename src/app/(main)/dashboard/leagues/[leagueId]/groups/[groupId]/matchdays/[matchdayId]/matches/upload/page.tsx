"use client";

import * as React from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

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

export default function UploadMatchesPage() {
  const { leagueId, groupId, matchdayId } = useParams<{
    leagueId: string;
    groupId: string;
    matchdayId: string;
  }>();

  const { userDoc, firebaseUser } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";
  const userId = firebaseUser?.uid ?? "";

  const [matchdayNumber, setMatchdayNumber] = React.useState<number | null>(null);
  const [league, setLeague] = React.useState<any | null>(null);
  const [group, setGroup] = React.useState<any | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  // cargar metadata (liga, grupo, jornada)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
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
        if (!mounted) return;
        setLeague(lg ?? null);
        setGroup(grp ?? null);
        setMatchdayNumber(md?.ok && typeof md.matchday?.number === "number" ? md.matchday.number : null);
      } catch {
        if (mounted) {
          setLeague(null);
          setGroup(null);
          setMatchdayNumber(null);
        }
      } finally {
        if (mounted) setMetaLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [leagueId, groupId, matchdayId]);

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
          <Link href={`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`}>Volver a jornadas</Link>
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
