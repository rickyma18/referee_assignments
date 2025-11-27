import {
  CalendarCheck,
  Users,
  Workflow,
  Shield,
  KanbanSquare,
  CalendarDays,
  Flag,
  Trophy,
  FileSpreadsheet,
  Swords,
  CircleDot,
  ListChecks,
} from "lucide-react";
import { FaFutbol, FaUniversity, FaRegIdCard, FaUserTie, FaFlagCheckered } from "react-icons/fa";
import { GiWhistle, GiSoccerKick, GiShieldOpposition } from "react-icons/gi";
import { MdAssignment, MdSportsSoccer } from "react-icons/md";

import type { UserRole } from "@/types/roles";

export type SidebarItem = {
  title: string;
  href?: string;
  icon?: any;
  children?: SidebarItem[];
  requiredRoles?: UserRole[];
  newTab?: boolean;
  comingSoon?: boolean;
  dynamic?: "groupsByLeague" | "matchdaysByGroup" | "teamsByGroup";
};

// ----------------------------------------------------
// NUEVA LISTA CON ÍCONOS MÁS VARIADOS Y TEMÁTICOS
// ----------------------------------------------------
export const sidebarItems: SidebarItem[] = [
  {
    title: "Designaciones",
    href: "/dashboard/assignments",
    icon: GiWhistle, // mucho más temático
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
  },
  {
    title: "Ligas - Grupos - Equipos",
    href: "/dashboard/teams-explorer",
    icon: FaUniversity, // más institucional
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
  },

  {
    title: "Árbitros y Asesores",
    href: "/dashboard/referees",
    icon: FaRegIdCard, // más RP / credencial
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
    children: [
      { title: "Todos los árbitros", href: "/dashboard/referees" },
      {
        title: "Nuevo árbitro",
        href: "/dashboard/referees/new",
        requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
      },
      {
        title: "Importar desde Excel",
        href: "/dashboard/referees/import",
        icon: FileSpreadsheet,
        requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
      },
      {
        title: "Ajustar RCS (oculto)",
        href: "/dashboard/referees/rcs",
        icon: ListChecks,
        requiredRoles: ["SUPERUSUARIO"],
      },
      {
        title: "Panel reglas internas (RA-XX)",
        href: "/dashboard/superuser/referees",
        icon: Shield,
        requiredRoles: ["SUPERUSUARIO"],
      },
    ],
  },

  {
    title: "Tier List Árbitros",
    href: "/dashboard/referees/tiers",
    icon: Trophy, // mucho más gamer / ranking vibes
    requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
  },

  {
    title: "Ligas",
    href: "/dashboard/leagues",
    icon: KanbanSquare,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"],
    children: [
      { title: "Todas las Ligas", href: "/dashboard/leagues" },
      {
        title: "Nueva Liga",
        href: "/dashboard/leagues/new",
        icon: CircleDot,
        requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
      },
    ],
  },

  {
    title: "Grupos",
    href: "/dashboard/leagues",
    icon: Workflow, // muy representativo para grupos / estructura
    requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
    dynamic: "groupsByLeague",
  },

  {
    title: "Equipos",
    href: "/dashboard/leagues",
    icon: FaFutbol,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO", "ASISTENTE"],
    dynamic: "teamsByGroup",
  },

  {
    title: "Tier List Equipos",
    href: "/dashboard/teams/tiers",
    icon: Swords, // estilo competitivo
    requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
  },

  {
    title: "Jornadas",
    href: "/dashboard/leagues",
    icon: CalendarDays,
    requiredRoles: ["SUPERUSUARIO", "DELEGADO"],
    dynamic: "matchdaysByGroup",
  },
];
