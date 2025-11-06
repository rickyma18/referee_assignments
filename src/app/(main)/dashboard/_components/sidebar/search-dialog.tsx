// =============================
// src/components/layout/search-dialog.tsx (o donde lo tengas)
// =============================
"use client";
import * as React from "react";

import { useRouter } from "next/navigation";

import {
  LayoutDashboard,
  Users,
  Shield,
  CalendarDays,
  ClipboardList,
  Flag,
  Layers,
  Group as GroupIcon, // si no existe este, usa Layers/FolderTree
  FolderTree,
  Shirt,
  Search,
  UserCircle2,
  HelpCircle,
} from "lucide-react";

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
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";
  const isReferee = role === "ARBITRO";

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
    const base: SearchEntry[] = [
      { group: "General", icon: LayoutDashboard, label: "Designaciones", href: "/dashboard/assignments" },
      { group: "General", icon: UserCircle2, label: "Mi perfil", href: "/profile" },
      { group: "General", icon: HelpCircle, label: "Ayuda", href: "/help" },
    ];

    const admin: SearchEntry[] = [
      { group: "Catálogos", icon: Flag, label: "Ligas", href: "/dashboard/leagues" },
      { group: "Catálogos", icon: FolderTree, label: "Nueva liga", href: "/dashboard/leagues/new" },
      {
        group: "Catálogos",
        icon: Shirt,
        label: "Explorador",
        href: "/dashboard/teams-explorer",
      },
    ];

    const referee: SearchEntry[] = [
      { group: "Mi trabajo", icon: ClipboardList, label: "Designaciones", href: "/dashboard/assignments" },
      { group: "Mi trabajo", icon: CalendarDays, label: "Mi calendario", href: "/dashboard/my-calendar" },
      // Acceso de solo lectura a catálogos (si quieres ocultarlos, marca disabled: true)
      { group: "Catálogos", icon: Flag, label: "Ligas (vista)", href: "/dashboard/leagues" },
      { group: "Catálogos", icon: FolderTree, label: "Grupos (vista)", href: "/dashboard/groups" },
      { group: "Catálogos", icon: Shirt, label: "Equipos (vista)", href: "/dashboard/teams" },
    ];

    return [...base, ...(canEdit ? admin : []), ...(isReferee ? referee : [])];
  }, [canEdit, isReferee]);

  const groups = React.useMemo(() => [...new Set(searchItems.map((i) => i.group))], [searchItems]);

  return (
    <>
      <Button
        variant="link"
        className="text-muted-foreground !px-0 font-normal hover:no-underline"
        onClick={() => setOpen(true)}
        aria-label="Abrir búsqueda"
      >
        <Search className="size-4" />
        Buscar
        <kbd className="bg-muted inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10px] font-medium select-none">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Busca ligas, grupos, equipos, designaciones…" />
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
