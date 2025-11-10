// NO pongas "use client" aquí
import { listMatchdaysAction } from "@/server/actions/matchdays.actions";

import { MatchdaysClient } from "./_components/matchdays-client";

type Props = { params: Promise<{ leagueId: string; groupId: string }> };

export default async function MatchdaysPage({ params }: Props) {
  // En Next 15/16 params puede ser Promise — desenvuélvelo
  const { leagueId, groupId } = await params;

  // Carga en servidor (admin SDK, revalidatePath, etc.)
  // Las actions ya regresan POJOs (toPlain), listos para el cliente.
  const data = await listMatchdaysAction({ leagueId, groupId });

  return <MatchdaysClient initialData={data} leagueId={leagueId} groupId={groupId} />;
}
