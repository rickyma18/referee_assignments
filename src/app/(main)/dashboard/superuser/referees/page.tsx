// src/app/(main)/dashboard/superuser/referees/page.tsx
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { listRefereesAction } from "@/server/actions/referees.actions";
import { ForbiddenError } from "@/server/auth/errors";
import { requireSuperuser } from "@/server/auth/require-role";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SuperuserRefereesRulesIndexPage() {
  noStore();

  // 🔒 Protegemos la vista a nivel server
  try {
    await requireSuperuser();
  } catch (e) {
    if (e instanceof ForbiddenError) {
      // 403 “bonito” en vez de tirar el error global
      return (
        <div className="space-y-4 p-6">
          <h1 className="text-2xl font-semibold">Acceso restringido</h1>
          <p className="text-muted-foreground text-sm">
            Esta vista sólo está disponible para usuarios con rol <strong>SUPERUSUARIO</strong>.
          </p>
        </div>
      );
    }
    // Si es otro tipo de error, sí lo dejamos subir para el error boundary
    throw e;
  }

  // Si llegamos aquí, ya somos SUPERUSUARIO
  const data = await listRefereesAction({
    q: "",
    status: undefined,
    category: undefined,
    limit: 200,
  });

  const items = data.items ?? [];

  return (
    <div className="space-y-4 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Panel de reglas internas (RA-XX)</h1>
        <p className="text-muted-foreground text-sm">
          Selecciona un árbitro para ver o editar sus reglas internas que afectan la auto-sugerencia.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay árbitros cargados todavía.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Árbitro</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.name ?? "Sin nombre"}</td>
                  <td className="px-3 py-2">{r.category ?? "-"}</td>
                  <td className="px-3 py-2">{r.status ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild size="sm">
                      <Link href={`/dashboard/superuser/referees/${r.id}/rules`}>Abrir reglas internas</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
