"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { listGroupsAction } from "@/server/actions/groups.actions";
import { listLeaguesAction } from "@/server/actions/leagues.actions";

export default function TeamsSelectorPage() {
  const router = useRouter();

  const [leagues, setLeagues] = React.useState<{ id: string; name: string; season: string }[]>([]);
  const [groups, setGroups] = React.useState<{ id: string; name: string; season: string }[]>([]);
  const [leagueId, setLeagueId] = React.useState<string>("");
  const [groupId, setGroupId] = React.useState<string>("");

  const [loadingLeagues, setLoadingLeagues] = React.useState(false);
  const [loadingGroups, setLoadingGroups] = React.useState(false);

  // Cargar ligas al montar
  React.useEffect(() => {
    (async () => {
      try {
        setLoadingLeagues(true);
        const data = await listLeaguesAction({});
        setLeagues(data ?? []);
      } catch (err: any) {
        toast.error("Error al cargar ligas");
      } finally {
        setLoadingLeagues(false);
      }
    })();
  }, []);

  // Cargar grupos cuando cambie liga
  React.useEffect(() => {
    if (!leagueId) {
      setGroups([]);
      setGroupId("");
      return;
    }

    (async () => {
      try {
        setLoadingGroups(true);
        const data = await listGroupsAction({ leagueId });
        setGroups(data ?? []);
      } catch (err: any) {
        toast.error("Error al cargar grupos");
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, [leagueId]);

  const goToTeams = () => {
    if (!leagueId || !groupId) return;
    router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gestión de Equipos</h1>
        <p className="text-muted-foreground text-sm">
          Selecciona una liga y un grupo para ver o administrar los equipos.
        </p>
      </div>

      <Separator />

      <div className="grid gap-6 sm:grid-cols-2 md:w-[600px]">
        {/* Selector de liga */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Liga</label>
          <Select disabled={loadingLeagues} onValueChange={(val) => setLeagueId(val)}>
            <SelectTrigger>
              <SelectValue placeholder={loadingLeagues ? "Cargando ligas..." : "Selecciona una liga"} />
            </SelectTrigger>
            <SelectContent>
              {leagues.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} ({l.season})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selector de grupo */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Grupo</label>
          <Select disabled={!leagueId || loadingGroups} onValueChange={(val) => setGroupId(val)}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !leagueId
                    ? "Selecciona una liga primero"
                    : loadingGroups
                      ? "Cargando grupos..."
                      : "Selecciona un grupo"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name} ({g.season})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-4">
        <Button disabled={!leagueId || !groupId} onClick={goToTeams} className="px-8">
          Ir a Equipos
        </Button>
      </div>
    </div>
  );
}
