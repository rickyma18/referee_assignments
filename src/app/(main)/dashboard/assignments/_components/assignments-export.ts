// src/app/(main)/dashboard/assignments/_components/assignments-export.ts

import type { AssignmentRowState, RefereeOption, LeagueDoc } from "./assignments-types";

export function buildExportRows(
  rows: AssignmentRowState[],
  referees: RefereeOption[],
  leagueById: Map<string, LeagueDoc>,
) {
  const getRefName = (id?: string | null) => {
    if (!id) return "";
    if (id.startsWith("ext:")) {
      return id.replace("ext:", "");
    }
    return referees.find((r) => r.id === id)?.name ?? "";
  };

  return rows.map((m) => {
    const league = leagueById.get(m.leagueId);
    const kickoff = m.kickoff ? new Date(m.kickoff) : null;

    const fecha = kickoff
      ? kickoff.toLocaleString("es-MX", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    return {
      Liga: league?.name ?? m.leagueName,
      Grupo: m.groupName,
      Jornada: m.matchdayNumber ?? "",
      Fecha: fecha,
      "Equipo local": m.homeTeamName,
      "Equipo visitante": m.awayTeamName,
      Sede: m.venueName ?? "",
      Central: getRefName(m.central),
      "Asistente 1": getRefName(m.aa1),
      "Asistente 2": getRefName(m.aa2),
      "4º Árbitro": getRefName(m.fourth),
      Asesor: getRefName(m.assessor),
    };
  });
}
