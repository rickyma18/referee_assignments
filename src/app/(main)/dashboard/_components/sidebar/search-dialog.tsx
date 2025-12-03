// =============================
// src/components/layout/search-dialog.tsx
// =============================
"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import {
  CalendarDays,
  KanbanSquare,
  Shield,
  Trophy,
  FileSpreadsheet,
  ListChecks,
  UserCircle2,
  HelpCircle,
  Swords,
  Search as SearchIcon,
} from "lucide-react";
import { FaUniversity, FaRegIdCard, FaFutbol } from "react-icons/fa";
import { GiWhistle } from "react-icons/gi";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCurrentUser } from "@/hooks/use-current-user";

type SearchEntry = {
  group: string;
  label: string;
  href?: string;
  disabled?: boolean;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;

  const isSuper = role === "SUPERUSUARIO";
  const isDelegado = role === "DELEGADO";
  const isAsistente = role === "ASISTENTE";
  const isReferee = role === "ARBITRO";

  const canSeeDashboard = isSuper || isDelegado || isAsistente || isReferee;
  const canEdit = isSuper || isDelegado;

  // ⌘+J / Ctrl+J abre el diálogo
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const searchItems = React.useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];

    // -----------------------------
    // Navegación principal (sidebar)
    // -----------------------------
    if (canSeeDashboard) {
      entries.push(
        {
          group: "Navegación principal",
          icon: GiWhistle,
          label: "Designaciones",
          href: "/dashboard/assignments",
        },
        {
          group: "Navegación principal",
          icon: FaUniversity,
          label: "Ligas - Grupos - Equipos",
          href: "/dashboard/teams-explorer",
        },
      );
    }

    // -----------------------------
    // Árbitros y asesores
    // -----------------------------
    if (canSeeDashboard) {
      entries.push({
        group: "Árbitros",
        icon: FaRegIdCard,
        label: "Listado de árbitros",
        href: "/dashboard/referees",
      });

      if (canEdit) {
        entries.push(
          {
            group: "Árbitros",
            icon: FaRegIdCard,
            label: "Nuevo árbitro",
            href: "/dashboard/referees/new",
          },
          {
            group: "Árbitros",
            icon: FileSpreadsheet,
            label: "Importar árbitros desde Excel",
            href: "/dashboard/referees/import",
          },
        );
      }

      if (isSuper) {
        entries.push(
          {
            group: "Árbitros",
            icon: ListChecks,
            label: "Ajustar RCS (oculto)",
            href: "/dashboard/referees/rcs",
          },
          {
            group: "Árbitros",
            icon: Shield,
            label: "Panel reglas internas (RA-XX)",
            href: "/dashboard/superuser/referees",
          },
        );
      }

      if (canEdit) {
        entries.push({
          group: "Árbitros",
          icon: Trophy,
          label: "Tier List Árbitros",
          href: "/dashboard/referees/tiers",
        });
      }
    }

    // -----------------------------
    // Ligas y grupos
    // -----------------------------
    if (canSeeDashboard) {
      entries.push({
        group: "Ligas y grupos",
        icon: KanbanSquare,
        label: "Todas las ligas",
        href: "/dashboard/leagues",
      });

      if (canEdit) {
        entries.push({
          group: "Ligas y grupos",
          icon: KanbanSquare,
          label: "Nueva liga",
          href: "/dashboard/leagues/new",
        });
      }

      entries.push({
        group: "Ligas y grupos",
        icon: CalendarDays,
        label: "Jornadas por grupo",
        href: "/dashboard/leagues", // misma ruta base, la vista dinámica hace el resto
      });
    }

    // -----------------------------
    // Equipos
    // -----------------------------
    if (canSeeDashboard) {
      entries.push(
        {
          group: "Equipos",
          icon: FaFutbol,
          label: "Equipos por grupo",
          href: "/dashboard/leagues", // igual que en sidebar, vista dinámica
        },
        {
          group: "Equipos",
          icon: FaUniversity,
          label: "Explorador Ligas-Grupos-Equipos",
          href: "/dashboard/teams-explorer",
        },
      );

      if (canEdit) {
        entries.push({
          group: "Equipos",
          icon: Swords,
          label: "Tier List Equipos",
          href: "/dashboard/teams/tiers",
        });
      }
    }

    // -----------------------------
    // Mi trabajo (para árbitros)
    // -----------------------------
    if (isReferee) {
      entries.push({
        group: "Mi trabajo",
        icon: GiWhistle,
        label: "Mis designaciones",
        href: "/dashboard/assignments",
      });
    }

    // -----------------------------
    // Utilidades generales
    // -----------------------------
    entries.push(
      {
        group: "Utilidades",
        icon: UserCircle2,
        label: "Mi perfil",
        href: "/dashboard/account",
      },
      {
        group: "Utilidades",
        icon: HelpCircle,
        label: "Ayuda",
        href: "/dashboard/help",
      },
    );

    return entries;
  }, [canSeeDashboard, canEdit, isReferee, isSuper]);

  const groups = React.useMemo(() => [...new Set(searchItems.map((i) => i.group))], [searchItems]);

  return (
    <>
      <Button
        variant="link"
        className="text-muted-foreground !px-0 font-normal hover:no-underline"
        onClick={() => setOpen(true)}
        aria-label="Abrir búsqueda"
      >
        <SearchIcon className="size-4" />
        Buscar
        <kbd className="bg-muted inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10px] font-medium select-none">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Busca ligas, árbitros, equipos, designaciones…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>

          {groups.map((group, i) => (
            <React.Fragment key={group}>
              {i !== 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {searchItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      key={group + item.label}
                      className="!py-1.5"
                      disabled={item.disabled}
                      onSelect={() => {
                        if (item.href && !item.disabled) {
                          router.push(item.href);
                        }
                        setOpen(false);
                      }}
                    >
                      {item.icon && <item.icon className="mr-2 size-4" />}
                      <span>{item.label}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
