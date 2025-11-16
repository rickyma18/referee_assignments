"use client";

// src/app/(main)/dashboard/assignments/_components/referee-select.tsx

import * as React from "react";

import { ChevronsUpDown, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { RefereeOption } from "./assignments-types";

export type RefereeSelectMode = "ALL" | "ARBITRO" | "ASESOR";

type Props = {
  value: string;
  onChange: (v: string) => void;
  referees: RefereeOption[];
  placeholder: string;
  mode?: RefereeSelectMode;
};

export function RefereeSelect({ value, onChange, referees, placeholder, mode = "ALL" }: Props) {
  const [open, setOpen] = React.useState(false);

  // Filtrado por rol (árbitro vs asesor) + orden alfabético
  const options = React.useMemo(() => {
    let list = referees;

    if (mode === "ARBITRO") {
      // Solo árbitros: canAssess === false
      list = list.filter((r) => !r.canAssess);
    } else if (mode === "ASESOR") {
      // Solo asesores: canAssess === true
      list = list.filter((r) => r.canAssess);
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  }, [mode, referees]);

  const selected = options.find((r) => r.id === value) ?? referees.find((r) => r.id === value);
  const label = selected?.name ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-2 text-xs"
        >
          {label || <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${placeholder.toLowerCase()}...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-muted-foreground py-2 text-xs">No se encontraron coincidencias.</CommandEmpty>
            <CommandGroup>
              {/* Opción "Sin asignar" */}
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Check className={cn("mr-2 h-3 w-3", value === "" ? "opacity-100" : "opacity-0")} />
                Sin asignar
              </CommandItem>

              {options.map((r) => (
                <CommandItem
                  key={r.id}
                  value={r.name}
                  onSelect={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === r.id ? "opacity-100" : "opacity-0")} />
                  {r.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
