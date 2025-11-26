// src/app/(main)/dashboard/referees/tiers/page.tsx
import "@/server/admin/firebase-admin";

import { EntityHeader } from "@/components/entity-header";
import { listRefereesAction } from "@/server/actions/referees.actions";

import { RefereeTiersBoard } from "./_components/referee-tiers-board";

export const dynamic = "force-static"; // o simplemente borrar la línea
export const revalidate = 60; // o 0 si usarás revalidatePath en las actions
export const runtime = "nodejs";

export default async function Page() {
  const { items } = await listRefereesAction({ limit: 100 });
  const referees = (items ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    tier: (r.tier as string | undefined) ?? "DEBUTANTE",
    category: (r.category as string | undefined) ?? null,
    zones: (r.zones as string[] | undefined) ?? [],
  }));

  return (
    <div className="space-y-6">
      <EntityHeader
        loading={false}
        logoUrl="/media/FMF_Logo.png"
        title="Tiers de árbitros"
        subtitle="Arrastra cada árbitro al nivel que le corresponde para influir en las sugerencias automáticas."
        colorHex={null}
        canDelete={false}
      />
      <RefereeTiersBoard referees={referees} />
    </div>
  );
}
