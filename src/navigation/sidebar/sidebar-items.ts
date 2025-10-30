// src/navigation/sidebar/sidebar-items.ts
import {
  LayoutDashboard,
  PersonStanding,
  Shield,
  Star,
  Circle,
  ChartBar,
  Fingerprint,
  type LucideIcon,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

// Opcional: centraliza el prefijo para no repetir strings
const DASH = "/dashboard" as const;

export const sidebarItems = [
  {
    id: 1,
    label: "Dashboards",
    items: [
      { title: "Designaciones", url: `${DASH}/default`, icon: LayoutDashboard },
      { title: "Árbitros", url: `${DASH}/referees`, icon: PersonStanding },
      { title: "Equipos", url: `${DASH}/teams`, icon: Shield },
      { title: "Partidos", url: `${DASH}/matches`, icon: Circle },
      { title: "Evaluaciones", url: `${DASH}/evaluations`, icon: Star },
      { title: "Configuración", url: `${DASH}/config`, icon: ChartBar },
    ],
  },
] as const satisfies ReadonlyArray<NavGroup>;
