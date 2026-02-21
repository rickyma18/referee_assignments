// =============================
// src/hooks/use-groups.ts (SWR para combos y listas)
// =============================
"use client";
import useSWR from "swr";

import { listGroupsAction } from "@/server/actions/groups.actions";

export function useGroups(leagueId: string, season?: string) {
  const key = leagueId ? ["groups", leagueId, season ?? "all"] : null;
  const { data, error, isValidating, mutate } = useSWR(key, async () => {
    if (!leagueId) return [] as any[];
    return listGroupsAction({ leagueId, season });
  });
  return {
    groups: data ?? [],
    loading: !error && !data,
    error,
    isValidating,
    reload: () => mutate(),
  };
}
