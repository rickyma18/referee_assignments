"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

import { useCurrentUser } from "@/hooks/use-current-user";
import { listLeaguesAction, deleteLeagueAction } from "@/server/actions/leagues.actions";

type LeagueRow = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string;
  slug?: string;
};

export default function LeaguesPage() {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [items, setItems] = React.useState<LeagueRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = (await listLeaguesAction({})) as LeagueRow[];
      setItems(data ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al listar ligas");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    toast.promise(deleteLeagueAction(id), {
      loading: "Eliminando liga...",
      success: () => {
        load();
        return "Liga eliminada correctamente";
      },
      error: (e) => e?.message ?? "No se pudo eliminar la liga",
    });
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Ligas</h1>
        {canEdit && (
          <Button asChild>
            <Link href="/dashboard/leagues/new">Nueva liga</Link>
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Temporada</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">
                  <Link
                    href={`/dashboard/leagues/${l.id}`}
                    className="group focus-visible:ring-ring inline-flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2"
                    aria-label={`Abrir liga ${l.name}`}
                    title={`Abrir liga ${l.name}`}
                  >
                    {l.color ? (
                      <span
                        className="inline-block h-3 w-3 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                        style={{ backgroundColor: l.color }}
                      />
                    ) : null}
                    <span className="font-medium underline-offset-4 group-hover:underline">{l.name}</span>
                  </Link>
                </td>
                <td className="p-2">{l.season}</td>
                <td className="p-2">{l.status ?? "ACTIVE"}</td>
                <td className="space-x-2 p-2 text-right">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/dashboard/leagues/${l.id}`}>Abrir</Link>
                  </Button>

                  {/* 👉 Ir a grupos de esta liga */}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/leagues/${l.id}/`}>Grupos</Link>
                  </Button>

                  {canEdit && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar liga &quot;{l.name}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminarán todos los datos relacionados con esta liga.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(l.id)} className="bg-red-500 hover:bg-red-700">
                            Confirmar eliminación
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && !loading && (
              <tr>
                <td colSpan={4} className="p-4 text-center opacity-60">
                  Sin datos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
