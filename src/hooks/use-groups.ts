"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type GroupOption = { id: string; name: string; season: string };

export function useGroupsCombo(params?: { search?: string; season?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.season) qs.set("season", params.season);

  const { data, isLoading, error, mutate } = useSWR<GroupOption[]>(
    `/api/groups${qs.toString() ? "?" + qs.toString() : ""}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    groups: data ?? [],
    loading: isLoading,
    error,
    refresh: mutate,
  };
}
