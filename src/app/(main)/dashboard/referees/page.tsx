// NO pongas "use client" aquí
import { unstable_noStore as noStore } from "next/cache";

import { listRefereesAction, setRefereeStatusAction, deleteRefereeAction } from "@/server/actions/referees.actions";

import { RefereesClient } from "./_components/referees-client";

export const dynamic = "force-dynamic";
export const revalidate = 0; // cinturón y tirantes

type SearchParams = {
  q?: string;
  status?: string;
  category?: string;
};

export default async function RefereesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  noStore(); // <- asegura que cada combinación q/status/category haga render fresco

  const sp = await searchParams;

  const q = sp.q ?? "";
  const status = (sp.status as any) ?? undefined;
  const category = (sp.category as any) ?? undefined;

  const data = await listRefereesAction({ q, status, category, limit: 50 });

  const setStatus = async (formData: FormData) => {
    "use server";
    const id = String(formData.get("id") ?? "");
    const s = String(formData.get("status") ?? "DISPONIBLE");
    await setRefereeStatusAction(id, s);
  };

  const deleteAction = async (formData: FormData) => {
    "use server";
    const id = String(formData.get("id") ?? "");
    await deleteRefereeAction(id);
  };

  return <RefereesClient initialItems={data.items ?? []} setStatusAction={setStatus} deleteAction={deleteAction} />;
}
