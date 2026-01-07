// NO pongas "use client" aquí
import { listLeaguesAction, deleteLeagueAction } from "@/server/actions/leagues.actions";

import { LeaguesClient } from "./_components/leagues-client";

type SearchParams = {
  delegateId?: string;
};

export default async function LeaguesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const delegateId = sp.delegateId ?? undefined;

  const data = await listLeaguesAction({}, { selectedDelegateId: delegateId });

  // 👇 ESTA es la Server Action que SÍ puedes pasar a un Client Component
  const deleteAction = async (formData: FormData) => {
    "use server"; // ← DIRECTIVA DENTRO de la función
    const id = String(formData.get("id") ?? "");
    await deleteLeagueAction(id);
  };

  return <LeaguesClient initialItems={data ?? []} deleteAction={deleteAction} />;
}
