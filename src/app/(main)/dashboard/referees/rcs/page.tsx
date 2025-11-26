// src/app/(main)/dashboard/referees/rcs/page.tsx

import { unstable_noStore as noStore } from "next/cache";

import { getFirestore } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { refereeTierToRcsCentral } from "@/domain/referees/referee-tier";
import { setRefereeRcsOverrideAction } from "@/server/actions/referees.actions";
import { ForbiddenError } from "@/server/auth/errors"; // 👈 importa la excepción
import { requireSuperuser } from "@/server/auth/require-role";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RefRow = {
  id: string;
  name: string;
  tier: string | null;
  category: string | null;
  rcsFromTier: number | null;
  rcsOverrideCentral: number | null;
};

export default async function RefereesRcsPage() {
  noStore();

  // 🔒 En vez de dejar que reviente la app, lo capturamos y mostramos 403
  try {
    await requireSuperuser();
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return (
        <div className="space-y-4">
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

  const db = getFirestore();
  const snap = await db.collection("referees").orderBy("name_lc").limit(300).get();

  const rows: RefRow[] = snap.docs.map((doc) => {
    const data = doc.data() as any;

    const tier = (data?.tier ?? null) as string | null;
    const rcsFromTier = refereeTierToRcsCentral(tier as any);

    const overrideRaw = data?.rcsOverrideCentral;
    const rcsOverrideCentral = typeof overrideRaw === "number" && Number.isFinite(overrideRaw) ? overrideRaw : null;

    return {
      id: doc.id,
      name: (data?.name as string) ?? "Sin nombre",
      tier,
      category: (data?.category ?? null) as string | null,
      rcsFromTier,
      rcsOverrideCentral,
    };
  });

  const updateRcs = async (formData: FormData) => {
    "use server";
    const id = String(formData.get("id") ?? "");
    const raw = formData.get("rcsOverride");
    const rcsOverride = raw === null ? null : String(raw);

    await setRefereeRcsOverrideAction({ id, rcsOverride });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">RCS de árbitros (solo superusuario)</h1>
      <p className="text-muted-foreground text-sm">
        Aquí puedes ajustar el RCS que usa el motor de ternas sin cambiar el tier visible en el resto del sistema. Deja
        el campo vacío para volver al valor base según el tier.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Listado de árbitros</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2">
          {/* Encabezados */}
          <div className="text-muted-foreground grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] gap-2 text-xs font-medium">
            <span>Nombre</span>
            <span>Tier</span>
            <span>RCS base</span>
            <span>RCS override</span>
            <span>Acciones</span>
          </div>

          {rows.map((r) => (
            <form
              key={r.id}
              action={updateRcs}
              className="mt-2 grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] items-center gap-2 border-t pt-2"
            >
              <input type="hidden" name="id" value={r.id} />

              <div className="truncate text-sm">{r.name}</div>
              <div className="text-xs">{r.tier ?? "—"}</div>
              <div className="text-xs">{r.rcsFromTier ?? "—"}</div>

              <div>
                <Input
                  name="rcsOverride"
                  defaultValue={r.rcsOverrideCentral ?? ""}
                  placeholder="(usa base)"
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-8 px-3">
                  Guardar
                </Button>
              </div>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
