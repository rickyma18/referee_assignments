"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { deleteGroupAction } from "@/server/actions/groups.actions";

type GroupRow = { id: string; name: string; season: string };

export default function GroupsPage() {
  const { firebaseUser, userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [search, setSearch] = React.useState("");
  const [season, setSeason] = React.useState("");
  const [items, setItems] = React.useState<GroupRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (season) qs.set("season", season);

      const res = await fetch(`/api/groups${qs.toString() ? `?${qs.toString()}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudo obtener grupos");
      const data = (await res.json()) as GroupRow[];
      setItems(data);
    } catch (e: any) {
      toast.error(e.message ?? "Error al listar grupos");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => load();

  const onDelete = async (id: string) => {
    if (!confirm("¿Eliminar este grupo?")) return;
    try {
      await deleteGroupAction(id, role); // 🔑 pasa el role a la Server Action
      toast.success("Grupo eliminado");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    }
  };

  if (!firebaseUser) {
    return <div className="p-6">Inicia sesión…</div>;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Grupos</h1>
        {canEdit && (
          <Button asChild>
            <Link href="/dashboard/groups/new">Nuevo</Link>
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input placeholder="Buscar nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Input placeholder="Temporada (ej. 2025-26)" value={season} onChange={(e) => setSeason(e.target.value)} />
        <Button onClick={onSearch} disabled={loading}>
          {loading ? "Buscando…" : "Buscar"}
        </Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Temporada</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="p-2">{g.name}</td>
                <td className="p-2">{g.season}</td>
                <td className="space-x-2 p-2 text-right">
                  {canEdit ? (
                    <>
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/dashboard/groups/${g.id}`}>Editar</Link>
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete(g.id)}>
                        Eliminar
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs opacity-60">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && !loading && (
              <tr>
                <td colSpan={3} className="p-4 text-center opacity-60">
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
