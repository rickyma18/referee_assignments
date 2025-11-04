// =============================
// src/app/(main)/dashboard/leagues/[leagueId]/groups/new/page.tsx
// =============================
"use client";
import { useParams } from "next/navigation";
import { GroupForm } from "../_components/group-form";

export default function NewGroupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Nuevo grupo</h1>
      <GroupForm leagueId={String(leagueId)} />
    </div>
  );
}
