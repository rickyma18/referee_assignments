"use server";
import "server-only";
import { RefereeCreateZ } from "@/domain/referees/referee.zod";
import { secureWrite } from "@/server/auth/secure-action";
import * as repo from "@/server/repositories/referees.repo";

// 🔹 Tipado de la fila "cruda" que viene del Excel (client)
type ExcelRefRow = {
  Nombre: string;
  Zonas: string;
  Roles: string;
  Estado: string;
  Categoría: string;
  Teléfono: string;
  Correo: string;
  RFC: string;
  CURP: string;
  NUI: string;
  FotoURL: string;
  Tipo: string; // "ARBITRO" | "ASESOR" (opcional)
};

// 🔹 Normaliza una fila de Excel al shape esperado por RefereeCreateZ
function normalizeExcelRow(row: ExcelRefRow) {
  const s = (v: unknown) => String(v ?? "").trim();

  const name = s(row.Nombre);
  const zones = s(row.Zonas)
    .split(",")
    .map((z) => z.trim())
    .filter(Boolean);

  const rolesAllowed = s(row.Roles)
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean);

  const status = s(row.Estado).toUpperCase() || "DISPONIBLE";
  const category = s(row.Categoría).toUpperCase() || "TDP";

  const phone = s(row.Teléfono) || undefined;
  const email = s(row.Correo) || undefined;
  const rfc = s(row.RFC) || undefined;
  const curp = s(row.CURP) || undefined;
  const nui = s(row.NUI) || undefined;
  const photoUrl = s(row.FotoURL) || undefined;

  const tipo = s(row.Tipo).toUpperCase();
  const canAssess = tipo === "ASESOR"; // 👈 ASESOR → canAssess: true, lo demás false

  // 👇 Ajusta estos campos al modelo real de RefereeCreateZ
  const normalized = {
    name,
    zones,
    rolesAllowed,
    status,
    category,
    phone,
    email,
    rfc,
    curp,
    nui,
    photoUrl,
    canAssess,
  };

  return normalized;
}

export async function validateRefereesDryRun(rows: any[]) {
  // rows viene como array de ExcelRefRow desde el cliente
  const resultRows = rows.map((raw: ExcelRefRow, index: number) => {
    const normalized = normalizeExcelRow(raw);
    const parsed = RefereeCreateZ.safeParse(normalized);

    if (parsed.success) {
      return { errors: [] as string[], normalized: parsed.data };
    }

    const errors = parsed.error.errors.map((e) => {
      const path = e.path.join(".");
      return path ? `[fila ${index + 1}] ${path}: ${e.message}` : `[fila ${index + 1}] ${e.message}`;
    });

    return { errors, normalized };
  });

  const ok = resultRows.every((r) => r.errors.length === 0);

  return { ok, rows: resultRows };
}

export async function confirmRefereesImport({ rows }: { rows: any[] }) {
  return secureWrite(async () => {
    let created = 0;
    const errors: string[] = [];

    for (const r of rows) {
      try {
        // rows aquí ya deberían venir normalizadas desde el cliente:
        // payload.rows = (result.rows ?? rows).map((r) => r.normalized ?? r)
        const parsed = RefereeCreateZ.parse(r);

        const res = await repo.create(parsed);
        if (res.ok) {
          created++;
        } else {
          errors.push(res.message ?? "Error desconocido");
        }
      } catch (e: any) {
        errors.push(e?.message ?? "Error");
      }
    }

    return { ok: errors.length === 0, created, errors };
  });
}
