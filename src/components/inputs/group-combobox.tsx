"use client";

import * as React from "react";
import { useGroupsCombo } from "@/hooks/use-groups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  value?: string; // groupId
  onChange?: (id: string | undefined) => void;
  seasonFilter?: string;
};

export function GroupCombobox({ value, onChange, seasonFilter }: Props) {
  const [search, setSearch] = React.useState("");
  const { groups, loading } = useGroupsCombo({ search, season: seasonFilter });

  return (
    <div className="space-y-2">
      <Input placeholder="Buscar grupo..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {loading ? (
          <span className="text-sm opacity-70">Cargando…</span>
        ) : groups.length ? (
          groups.map((g) => (
            <Button
              key={g.id}
              variant={g.id === value ? "default" : "secondary"}
              onClick={() => onChange?.(g.id)}
              className="text-sm"
            >
              {g.name} · {g.season}
            </Button>
          ))
        ) : (
          <span className="text-sm opacity-70">Sin resultados</span>
        )}
      </div>
    </div>
  );
}
