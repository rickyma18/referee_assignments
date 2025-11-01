export type Designation = {
  id: string;
  date: string; // ISO string: "2025-11-10"
  time?: string; // opcional, ej. "12:00"
  league: string; // ej. "Liga TDP"
  venue: string; // ej. "CEGUD"
  homeTeam: string;
  awayTeam: string;
  center?: string; // árbitro central
  aa1?: string; // asistente 1
  aa2?: string; // asistente 2
};
