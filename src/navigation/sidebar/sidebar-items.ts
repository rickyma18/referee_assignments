// =====================================
// src/navigation/sidebar/sidebar-items.ts
// =====================================
import { CalendarCheck, Layers, CalendarDays, UserRound } from "lucide-react"; // 👈 añade UserRound
import { FaFutbol } from "react-icons/fa";

import type { UserRole } from "@/types/roles";

export type SidebarItem = {
  title: string;
  href?: string;
  icon?: any;
  children?: SidebarItem[];
  requiredRoles?: UserRole[];
  newTab?: boolean;
  comingSoon?: boolean;
  dynamic?: "groupsByLeague" | "matchdaysByGroup" | "teamsByGroup"; // ⬅️ añade esto
};

export type NavMainItem = {
  title: string;
  url: string;
  icon?: any;
  newTab?: boolean;
  comingSoon?: boolean;
  subItems?: NavMainItem[];
};

export type NavGroup = {
  id: string;
  label?: string;
  items: NavMainItem[];
};

export const sidebarItems: SidebarItem[] = [
  {
    title: "Designaciones",
    href: "/dashboard/assignments",
    icon: CalendarCheck,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
  },
  {
    title: "Ligas - Grupos - Equipos",
    href: "/dashboard/teams-explorer",
    icon: FaFutbol,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
  },

  {
    title: "Árbitros y asesores",
    href: "/dashboard/referees",
    icon: UserRound,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
    children: [
      { title: "Todos los árbitros", href: "/dashboard/referees" },
      { title: "Nuevo árbitro", href: "/dashboard/referees/new", requiredRoles: ["SUPERUSUARIO", "DELEGADO"] },
      {
        title: "Importar desde Excel",
        href: "/dashboard/referees/import",
        requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
      },
    ],
  },

  {
    title: "Ligas",
    href: "/dashboard/leagues",
    icon: Layers,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
    children: [
      { title: "Todas las Ligas", href: "/dashboard/leagues" },
      { title: "Nueva Liga", href: "/dashboard/leagues/new", requiredRoles: ["SUPERUSUARIO", "DELEGADO"] },
    ],
  },
  {
    title: "Grupos",
    href: "/dashboard/leagues",
    icon: Layers,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
    dynamic: "groupsByLeague", // ⬅️ ya lo tienes
  },
  {
    title: "Equipos",
    href: "/dashboard/leagues", // ⬅️ mejor que apunte a leagues (como pivot)
    icon: FaFutbol,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE"],
    dynamic: "teamsByGroup", // ⬅️ marca como dinámico
  },
  {
    title: "Jornadas",
    href: "/dashboard/leagues",
    icon: CalendarDays,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
    dynamic: "matchdaysByGroup", // ⬅️ ya lo tienes
  },
];
