// src/navigation/sidebar/sidebar-items.ts
import { Users, CalendarCheck } from "lucide-react";
import type { UserRole } from "@/types/roles";

/**
 * Árbol base editable por roles (tu definición original + opcionales usados por UI)
 */
export type SidebarItem = {
  title: string;
  href?: string;
  icon?: any;
  children?: SidebarItem[];
  requiredRoles?: UserRole[];
  // opcionales que algunos componentes soportan:
  newTab?: boolean;
  comingSoon?: boolean;
};

/**
 * Estructura que espera NavMain (normalmente agrupado)
 */
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
    title: "Usuarios",
    href: "/admin/usuarios",
    icon: Users,
    requiredRoles: ["SUPERUSUARIO"],
  },
  {
    title: "Designaciones",
    icon: CalendarCheck,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
    children: [
      {
        title: "Nueva",
        href: "/delegado/designaciones/nueva",
        requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
      },
      {
        title: "Listado",
        href: "/designaciones",
        requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
      },
    ],
  },
];
