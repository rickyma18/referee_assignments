import { z } from "zod";

/**
 * Tipos de reglas internas soportadas por el panel secreto.
 */
export const InternalRuleTypeZ = z.enum([
  "RA_municipios_prohibidos",
  "RA_municipios_preferidos",
  "RA_dias_prohibidos",
  "RA_dias_preferidos",
  "RA_equipos_prohibidos",
  "RA_equipos_preferidos",
]);

export type InternalRuleType = z.infer<typeof InternalRuleTypeZ>;

// ------------------------------
// Parametrización por tipo
// ------------------------------

export const DiaSemanaZ = z.enum(["L", "M", "X", "J", "V", "S", "D"]);

// 👇 Ajuste: comentario ahora es optional + nullable
const ComentarioZ = z.string().max(500).optional().nullable();

const MunicipiosParamsZ = z.object({
  municipios: z.array(z.string().min(1)).min(1, "Agrega al menos un municipio."),
  comentario: ComentarioZ,
});

const DiasParamsZ = z.object({
  dias: z.array(DiaSemanaZ).min(1, "Selecciona al menos un día."),
  comentario: ComentarioZ,
});

const EquiposParamsZ = z.object({
  teamIds: z.array(z.string().min(1)).min(1, "Selecciona al menos un equipo."),
  comentario: ComentarioZ,
});

// ------------------------------
// Union discriminada: type + params
// ------------------------------

const InternalRuleParamsZ = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RA_municipios_prohibidos"),
    params: MunicipiosParamsZ,
  }),
  z.object({
    type: z.literal("RA_municipios_preferidos"),
    params: MunicipiosParamsZ.extend({
      pesoExtra: z.number().min(0.1).max(10).default(1),
    }),
  }),
  z.object({
    type: z.literal("RA_dias_prohibidos"),
    params: DiasParamsZ,
  }),
  z.object({
    type: z.literal("RA_dias_preferidos"),
    params: DiasParamsZ,
  }),
  z.object({
    type: z.literal("RA_equipos_prohibidos"),
    params: EquiposParamsZ,
  }),
  z.object({
    type: z.literal("RA_equipos_preferidos"),
    params: EquiposParamsZ.extend({
      pesoExtra: z.number().min(0.1).max(10).default(1),
    }),
  }),
]);

// ------------------------------
// 1) Payload UI → Server Action
// ------------------------------

const InternalRuleInputBaseZ = z.object({
  enabled: z.boolean().default(true),

  // 👇 Ajuste: ahora acepta string | null | undefined
  reason: z.string().max(500).optional().nullable(),
});

// intersection, no extend (necesario para discriminatedUnion)
export const InternalRuleInputZ = z.intersection(InternalRuleParamsZ, InternalRuleInputBaseZ);

export type InternalRuleInput = z.infer<typeof InternalRuleInputZ>;

// ------------------------------
// 2) Regla almacenada en Firestore
// ------------------------------

const InternalRuleStoredMetaZ = z.object({
  id: z.string(),
  refereeId: z.string(),
  enabled: z.boolean(),
  updatedAt: z.any(), // Timestamp de Firestore
  updatedBy: z.string(),

  // 👇 Igual aquí: optional + nullable
  reason: z.string().optional().nullable(),
});

// También intersection
export const InternalRuleZ = z.intersection(InternalRuleParamsZ, InternalRuleStoredMetaZ);

export type InternalRule = z.infer<typeof InternalRuleZ>;
