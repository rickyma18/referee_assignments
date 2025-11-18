// src/domain/referees/referee.zod.ts
import { z } from "zod";

import { RefereeTierValues } from "./referee-tier";

// ------------------------------
// Enums controlados (roles, estado, categoría)
// ------------------------------
export const RefRoleZ = z.enum(["CENTRAL", "AA1", "AA2", "4TO"]);
export const RefStatusZ = z.enum(["DISPONIBLE", "DUDOSO", "LESIONADO"]);
export const RefCategoryZ = z.enum(["TDP", "LP"]); // ampliable después

// ------------------------------
// Zonas (referencia a catálogo dinámico)
// ------------------------------
export const RefZoneZ = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
});

// ------------------------------
// Helpers: permitir vacío "" u omitir el campo
// ------------------------------
const optionalEmpty = (schema: z.ZodTypeAny) => z.union([schema, z.literal(""), z.undefined()]);

const optionalEmptyEmail = optionalEmpty(z.string().email("Email inválido")).describe("email | '' | undefined");

// Teléfono muy permisivo (+, espacios, guiones, paréntesis, 7–20 chars)
const optionalEmptyPhone = optionalEmpty(z.string().regex(/^[[\d+\-\s()]{7,20}$/, "Teléfono inválido")).describe(
  "phone | '' | undefined",
);

// URL (http/https) o vacío
const optionalEmptyUrl = optionalEmpty(z.string().trim().url("URL inválida (usa http/https)")).describe(
  "url | '' | undefined",
);

// --------------------------------------------------------
// 1) Base OBJETO sin superRefine (para poder usar .extend)
// --------------------------------------------------------
const RefereeBaseObj = z.object({
  name: z.string().min(3, "Nombre muy corto"),

  // Array de IDs de zonas
  zones: z.array(z.string().min(1)).min(1, "Selecciona al menos una zona"),

  // SIN .min aquí; la regla condicional se aplica luego en superRefine
  rolesAllowed: z.array(RefRoleZ).default([]),

  status: RefStatusZ.default("DISPONIBLE"),
  category: RefCategoryZ.default("TDP"),

  phone: optionalEmptyPhone,
  email: optionalEmptyEmail,
  photoUrl: optionalEmptyUrl,

  badgeNumber: optionalEmpty(z.string()),
  rfc: optionalEmpty(z.string()),
  curp: optionalEmpty(z.string()),

  // Puede fungir como asesor (excluyente con roles de partido)
  canAssess: z.boolean().default(false),

  tier: z.enum(RefereeTierValues).default("DEBUTANTE"),
});

// --------------------------------------------------------
// 2) Regla condicional (helper) para aplicar superRefine
//    - Si canAssess = true  => rolesAllowed debe estar vacío
//    - Si canAssess = false => rolesAllowed debe tener ≥ 1
// --------------------------------------------------------
function withAssessorRule<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((val: any, ctx) => {
    const rolesLen = val?.rolesAllowed?.length ?? 0;
    if (val?.canAssess) {
      if (rolesLen > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rolesAllowed"],
          message: "Si es Asesor no puede tener roles de partido.",
        });
      }
    } else {
      if (rolesLen === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rolesAllowed"],
          message: "Selecciona al menos un rol si no es Asesor.",
        });
      }
    }
  });
}

// --------------------------------------------------------
// 3) Schemas públicos
//    Nota: .extend() primero, luego withAssessorRule(...)
// --------------------------------------------------------

// Base “efectiva” (con regla). Útil si necesitas sólo el base validado.
export const RefereeBaseZ = withAssessorRule(RefereeBaseObj);

// Creación
export const RefereeCreateZ = withAssessorRule(RefereeBaseObj.extend({}));

// Actualización
export const RefereeUpdateZ = withAssessorRule(
  RefereeBaseObj.extend({
    id: z.string().min(1),
  }),
);

// Salida de repositorio
export const RefereeZ = withAssessorRule(
  RefereeBaseObj.extend({
    id: z.string(),
    name_lc: z.string(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
  }),
);

// ------------------------------
// Tipos exportados
// ------------------------------
export type RefRole = z.infer<typeof RefRoleZ>;
export type RefStatus = z.infer<typeof RefStatusZ>;
export type RefCategory = z.infer<typeof RefCategoryZ>;
export type RefZone = z.infer<typeof RefZoneZ>;
export type Referee = z.infer<typeof RefereeZ>;
