// =============================
// src/app/(main)/dashboard/leagues/[leagueId]/groups/page.tsx
// =============================
"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-current-user";
import { listGroupsAction, deleteGroupAction } from "@/server/actions/groups.actions";

export default function GroupsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [items, setItems] = React.useState<any[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await listGroupsAction({ leagueId, search });
      setItems(data ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (leagueId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, search]);
  const onDelete = async (id: string) => {
    if (!confirm("¿Eliminar grupo?")) return;
    try {
      await deleteGroupAction(String(leagueId), id);
      toast.success("Grupo eliminado");
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo eliminar");
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Grupos</h1>
        {canEdit && (
          <Link href={`/dashboard/leagues/${leagueId}/groups/new`}>
            <Button>Nuevo grupo</Button>
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        <Input placeholder="Buscar por nombre/temporada" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="outline" onClick={load} disabled={loading}>
          Buscar
        </Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-left">
              <th className="p-3">Nombre</th>
              <th className="p-3">Temporada</th>
              <th className="w-40 p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="p-3">{g.name}</td>
                <td className="p-3">{g.season}</td>
                <td className="flex gap-2 p-3">
                  <Link href={`/dashboard/leagues/${leagueId}/groups/${g.id}`}>
                    <Button variant="secondary">Editar</Button>
                  </Link>
                  {canEdit && (
                    <Button variant="destructive" onClick={() => onDelete(g.id)}>
                      Eliminar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td className="p-4" colSpan={3}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
