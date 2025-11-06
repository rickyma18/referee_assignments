// =====================================
// src/navigation/sidebar/sidebar-items.ts
// =====================================
import { CalendarCheck, Layers } from "lucide-react";
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
  // {
  //   title: "Usuarios",
  //   href: "/admin/usuarios",
  //   icon: Users,
  //   requiredRoles: ["SUPERUSUARIO"],
  // },

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
    title: "Administrar ligas",
    href: "/dashboard/leagues",
    icon: Layers,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
    children: [
      { title: "Todas las Ligas", href: "/dashboard/leagues" },
      {
        title: "Nueva Liga",
        href: "/dashboard/leagues/new",
        requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
      },
    ],
  },
];
