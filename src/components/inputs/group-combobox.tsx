// =============================
// src/components/inputs/group-combobox.tsx
// =============================
"use client";
import * as React from "react";

import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGroups } from "@/hooks/use-groups";
import { cn } from "@/lib/utils";

export function GroupCombobox({
  leagueId,
  value,
  onChange,
  placeholder = "Seleccionar grupo",
}: {
  leagueId: string;
  value?: string;
  onChange?: (id: string | undefined) => void;
  placeholder?: string;
}) {
  const { groups, loading } = useGroups(leagueId);
  const [open, setOpen] = React.useState(false);
  const selected = groups.find((g) => g.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {selected ? selected.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar grupo" />
          <CommandEmpty>{loading ? "Cargando..." : "Sin resultados"}</CommandEmpty>
          <CommandGroup>
            {groups.map((g) => (
              <CommandItem
                key={g.id}
                value={g.name}
                onSelect={() => {
                  onChange?.(g.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === g.id ? "opacity-100" : "opacity-0")} />
                {g.name} ({g.season})
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
