"use server";
import "server-only";
import { RefereeCreateZ } from "@/domain/referees/referee.zod";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { assertEffectiveDelegateId } from "@/server/auth/require-delegate-access";
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

type NormalizedRefRow = {
  name: string;
  zones: string[];
  status: string;
  category: string;
  email?: string;
};

function isNormalizedRefRow(v: unknown): v is NormalizedRefRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    "name" in o &&
    "zones" in o &&
    "status" in o &&
    "category" in o &&
    // email puede venir o no, pero si viene debe ser string
    (!("email" in o) || typeof o.email === "string" || o.email === undefined)
  );
}
function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0 || v.every((x) => isBlank(x));
  return String(v).trim() === "";
}

/**
 * Detecta si una fila está vacía (debe ignorarse).
 * Soporta filas crudas de Excel (con "Nombre") y normalizadas (con "name").
 */
// eslint-disable-next-line complexity
function isEmptyRow(row: unknown): boolean {
  if (!row || typeof row !== "object") return true;

  const r = row as Record<string, unknown>;

  // Caso 1: Fila cruda de Excel (tiene key "Nombre")
  if ("Nombre" in r) {
    return isBlank(r["Nombre"]) && isBlank(r["Zonas"]) && isBlank(r["Estado"]) && isBlank(r["Categoría"]);
  }

  // Caso 2: Fila normalizada (tiene key "name")
  if ("name" in r) {
    return isBlank(r.name) && isBlank(r.zones) && isBlank(r.status) && isBlank(r.category);
  }

  // Si no tiene ninguna key conocida, la consideramos vacía
  return true;
}

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
export async function validateRefereesDryRun(rows: ExcelRefRow[]) {
  const input = rows;

  const filtered = input.filter((r) => !isEmptyRow(r));

  const resultRows = filtered.map((raw, index) => {
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

  return {
    ok: resultRows.every((r) => r.errors.length === 0),
    rows: resultRows,
    ignored: input.length - filtered.length,
  };
}

export async function confirmRefereesImport({ rows }: { rows: any[] }) {
  // eslint-disable-next-line complexity
  return secureWrite(async () => {
    // ✅ Obtener delegateId del contexto de sesión
    const ctx = await getDelegateContext();
    const delegateId = assertEffectiveDelegateId(ctx);

    let created = 0;
    const errors: string[] = [];

    const debug: Array<{
      i: number;
      name?: string;
      ok?: boolean;
      message?: string;
    }> = [];

    for (let i = 0; i < (rows?.length ?? 0); i++) {
      const r = rows[i];

      try {
        const candidate = r?.normalized ?? r;
        const parsed = RefereeCreateZ.parse(candidate);

        // ✅ Inyectar delegateId al crear
        const res = await repo.create({ ...parsed, delegateId });

        debug.push({
          i,
          name: parsed.name,
          ok: res?.ok,
          message: res?.message ?? "(sin message)",
        });

        if (res?.ok) created++;
        else errors.push(res?.message ?? `repo.create devolvió ok=false (fila ${i + 1})`);
      } catch (e: any) {
        const msg = e?.message ?? "Error";
        debug.push({
          i,
          name: r?.name ?? r?.normalized?.name,
          ok: false,
          message: msg,
        });
        errors.push(msg);
      }
    }

    return {
      ok: errors.length === 0,
      created,
      errors,
      debug,
    };
  });
}
