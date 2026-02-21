/* eslint-disable complexity */
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
  const [searchValue, setSearchValue] = React.useState("");

  // Helper para detectar si es externo
  const isExternal = value.startsWith("ext:");
  const externalLabel = isExternal ? value.replace("ext:", "") : null;

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

    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

    // ✅ Opción extra para FORANEO
    // La agregamos al principio o final.
    // Usamos un ID especial para "FORANEO" predefinido -> "ext:FORANEO"
    const foraneoOption: RefereeOption = {
      id: "ext:FORANEO",
      name: "FORANEO",
      status: "DISPONIBLE",
      canAssess: mode === "ASESOR", // Dependiendo del modo
    };

    return [foraneoOption, ...sorted];
  }, [mode, referees]);

  const selected = options.find((r) => r.id === value);
  // Si es externo y no está en la lista (custom), usamos el label parseado
  let label = selected?.name;
  if (!label && isExternal && externalLabel) {
    label = externalLabel; // Mostrar tal cual viene (o con (Ext))
  }
  if (!label && value) {
    // Fallback por si acaso
    label = value;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-2 text-xs"
        >
          {label ?? <span className="text-muted-foreground">{placeholder}</span>}{" "}
          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Buscar ${placeholder.toLowerCase()}...`}
            className="h-8 text-xs"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            {/* Si no hay coincidencias exactas, permitimos crear EXTERNO */}
            {searchValue.length > 0 && !options.some((r) => r.name.toLowerCase() === searchValue.toLowerCase()) && (
              <CommandGroup heading="Quedará como externo">
                <CommandItem
                  value={"ext:" + searchValue}
                  onSelect={() => {
                    // Normalización básica: mayúsculas
                    onChange(`ext:${searchValue.toUpperCase()}`);
                    setOpen(false);
                    setSearchValue("");
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3 opacity-0")} />
                  Usar &quot;{searchValue.toUpperCase()}&quot;
                </CommandItem>
              </CommandGroup>
            )}

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

              {options
                .filter((r) => {
                  if (!searchValue) return true;
                  return r.name.toLowerCase().includes(searchValue.toLowerCase());
                })
                .map((r) => (
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
