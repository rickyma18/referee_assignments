export type Designation = {
  id: string;
  date: string; // ISO: 2025-10-29T17:00:00-06:00
  league: string; // TDP Jalisco
  matchday: number; // Jornada
  homeTeam: string;
  awayTeam: string;
  venue: string; // Estadio/Sede
  center: string; // Árbitro central
  aa1: string; // Asistente 1
  aa2: string; // Asistente 2
  fourth?: string; // Cuarto árbitro (opcional)
  difficulty?: "Baja" | "Media" | "Alta";
  status: "Programado" | "Confirmado" | "Reasignar";
};
