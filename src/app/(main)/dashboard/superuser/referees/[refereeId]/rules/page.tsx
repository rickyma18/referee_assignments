import { notFound } from "next/navigation";

import { getFirestore } from "firebase-admin/firestore";

import type { InternalRule } from "@/domain/referees/internal-rule.zod";
import { listInternalRulesAction } from "@/server/actions/internal-rules.actions";
import { requireSuperuser } from "@/server/auth/require-role";

import { InternalRulesClient } from "./_components/internal-rules-client";

type Props = {
  params: Promise<{ refereeId: string }>;
};

export const dynamic = "force-dynamic";

export default async function RefereeInternalRulesPage({ params }: Props) {
  const { uid } = await requireSuperuser(); // 🔒 doble check en el server

  const { refereeId } = await params;
  const db = getFirestore();

  const refSnap = await db.collection("referees").doc(refereeId).get();
  if (!refSnap.exists) {
    notFound();
  }

  const refData = refSnap.data() as any;

  const res = await listInternalRulesAction({ refereeId });
  const rules: InternalRule[] = res.ok ? res.data : [];

  const basicInfo = {
    id: refereeId,
    name: refData?.name ?? "Sin nombre",
    category: refData?.category ?? null,
    status: refData?.status ?? null,
    zones: (refData?.zones as string[] | undefined) ?? [],
    rolesAllowed: (refData?.rolesAllowed as string[] | undefined) ?? [],
    delegateId: (refData?.delegateId as string | undefined) ?? null, // ✅ Multi-tenant
  };

  return (
    <div className="space-y-6">
      {/* Ficha básica interna del árbitro */}
      <div className="bg-card flex flex-col gap-2 rounded-md border p-4">
        <h1 className="text-xl font-semibold">
          Reglas internas – {basicInfo.name} <span className="text-muted-foreground text-sm">({basicInfo.id})</span>
        </h1>
        <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
          {basicInfo.category && <span>Categoría: {basicInfo.category}</span>}
          {basicInfo.status && <span>Estado: {basicInfo.status}</span>}
          {basicInfo.rolesAllowed?.length ? <span>Roles: {basicInfo.rolesAllowed.join(", ")}</span> : null}
          {basicInfo.zones?.length ? <span>Zonas: {basicInfo.zones.join(", ")}</span> : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Módulo interno sólo para SUPERUSUARIO. Las reglas RA-XX aquí definidas afectan únicamente al motor de
          auto-sugerencia de ternas.
        </p>
      </div>

      {/* Panel de reglas internas (client) */}
      <InternalRulesClient referee={basicInfo} initialRules={rules} />
    </div>
  );
}
