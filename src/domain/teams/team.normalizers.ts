// =====================================
// src/domain/teams/team.normalizers.ts
// =====================================

// Normaliza nombre para comparaciones y unicidad
export function normTeamName(value: string) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " "); // colapsa espacios
}
