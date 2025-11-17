// src/app/(main)/dashboard/leagues/[leagueId]/page.tsx
"use client";

import * as React from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import { listGroupsAction, deleteGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type GroupRow = {
  id: string;
  name: string;
  season: string;
};

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as any)?.toDate === "function") {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      /* ignore */
    }
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, any>;
    const s = obj["seconds"] ?? obj["_seconds"];
    const n = obj["nanoseconds"] ?? obj["_nanoseconds"] ?? 0;
    if (typeof s === "number") {
      const ms = s * 1000 + Math.floor(n / 1e6);
      return new Date(ms).toISOString();
    }
  }
  return undefined;
}

function toLeagueUI(x: any): LeagueUI {
  if (!x) return x;
  return {
    id: String(x.id),
    name: String(x.name),
    season: String(x.season),
    status: x.status ?? "ACTIVE",
    color: x.color ?? null,
    slug: x.slug ?? null,
    logoUrl: x.logoUrl ?? x.logoURL ?? null,
    createdAt: toIso(x.createdAt),
    updatedAt: toIso(x.updatedAt),
  };
}

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const router = useRouter();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [groups, setGroups] = React.useState<GroupRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [lg, grs] = await Promise.all([
        getLeagueAction(String(leagueId)),
        listGroupsAction({ leagueId: String(leagueId) }),
      ]);
      setLeague(lg ? toLeagueUI(lg) : null);
      setGroups((grs ?? []) as GroupRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al cargar la liga");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (leagueId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  if (loading) return <div className="p-6">Cargando...</div>;
  if (!league) return <div className="p-6">Liga no encontrada</div>;

  const l = league; // 👈 aseguramos que ya no es null
  const status = l.status ?? "ACTIVE";

  async function handleDelete(group: GroupRow) {
    try {
      setDeletingId(group.id);
      const res = await deleteGroupAction(l.id, group.id);
      if ((res as any)?.ok === false) {
        toast.error((res as any)?.message ?? "No se pudo eliminar el grupo");
        return;
      }
      toast.success("Grupo eliminado correctamente");
      setGroups((prev) => prev.filter((x) => x.id !== group.id));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Ocurrió un error al eliminar el grupo");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header de liga */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {l.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={l.logoUrl}
                alt={`${l.name} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm opacity-50">Sin logo</div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl leading-tight font-bold">{l.name}</h1>
              <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{status}</Badge>
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              Temporada: <span className="font-medium">{l.season}</span>
              {l.slug ? (
                <>
                  {" · "}Slug: <span className="font-mono">{l.slug}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/leagues">Volver a ligas</Link>
          </Button>
          {canEdit && (
            <>
              <Button asChild>
                <Link href={`/dashboard/leagues/${l.id}/groups/new`}>Nuevo grupo</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/dashboard/leagues/${l.id}/edit`}>Editar liga</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {l.color ? (
        <div className="flex items-center gap-3 text-sm">
          <span
            className="inline-block size-5 rounded-md border"
            style={{ backgroundColor: l.color ?? undefined }}
            title={l.color ?? ""}
          />
          <span className="text-muted-foreground">Color:</span>
          <span className="font-mono">{l.color}</span>
        </div>
      ) : null}

      <Separator />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Grupos ({groups.length})</h2>
        {canEdit && (
          <Button asChild>
            <Link href={`/dashboard/leagues/${l.id}/groups/new`}>Crear grupo</Link>
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Nombre</th>
              <th className="p-3">Temporada</th>
              {canEdit && <th className="w-72 p-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="p-3">
                  <Link href={`/dashboard/leagues/${l.id}/groups/${g.id}/teams`}>{g.name}</Link>
                </td>
                <td className="p-3">{g.season}</td>
                {canEdit && (
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/dashboard/leagues/${l.id}/groups/${g.id}`}>Editar</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/leagues/${l.id}/groups/${g.id}/teams`}>Ver equipos</Link>
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" disabled={deletingId === g.id}>
                            {deletingId === g.id ? "Eliminando..." : "Eliminar"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar grupo</AlertDialogTitle>
                            <AlertDialogDescription>
                              Vas a eliminar el grupo <span className="font-semibold">{g.name}</span>. Esta acción no se
                              puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(g)}>Confirmar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan={3} className="text-muted-foreground p-6 text-center">
                  Aún no hay grupos en esta liga.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
