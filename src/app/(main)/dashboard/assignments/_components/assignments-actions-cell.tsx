"use client";

// src/app/(main)/dashboard/assignments/_components/assignments-actions-cell.tsx

import * as React from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { assignManualTernaAction } from "@/server/actions/assignments.actions";

import type { AssignmentRowState, AssignmentTableMeta } from "./assignments-types";

type Props = {
  row: AssignmentRowState;
  meta: AssignmentTableMeta;
};

export function ActionsCell({ row: m, meta }: Props) {
  const [saving, setSaving] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el timer si el componente se desmonta
  React.useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function markSaved() {
    meta.onSaved();
    setJustSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 2500);
  }

  // La terna "completa" sigue siendo central + AA1 + AA2; 4º y asesor son opcionales
  const hasTerna = Boolean(m.central && m.aa1 && m.aa2);

  // eslint-disable-next-line complexity
  async function doAssign(options?: { ignoreRecentTeamConflicts?: boolean; ignoreSameDayConflicts?: boolean }) {
    if (!m.central || !m.aa1 || !m.aa2) {
      toast.error("Debes seleccionar al menos Central y los dos Asistentes.");
      return;
    }

    // 🧩 Nueva validación: no permitir repetidos en la terna principal
    const coreIds = [m.central, m.aa1, m.aa2];
    const uniqueCoreIds = new Set(coreIds);

    if (uniqueCoreIds.size !== coreIds.length) {
      toast.error("Un árbitro no puede repetirse como central y asistente en la misma terna.");
      return;
    }

    try {
      setSaving(true);

      const centralName = meta.referees.find((r) => r.id === m.central)?.name ?? "";
      const aa1Name = meta.referees.find((r) => r.id === m.aa1)?.name ?? "";
      const aa2Name = meta.referees.find((r) => r.id === m.aa2)?.name ?? "";
      const fourthName = m.fourth ? (meta.referees.find((r) => r.id === m.fourth)?.name ?? "") : "";
      const assessorName = m.assessor ? (meta.referees.find((r) => r.id === m.assessor)?.name ?? "") : "";

      const fd = new FormData();
      fd.append("leagueId", m.leagueId);
      fd.append("groupId", m.groupId);
      fd.append("matchdayId", m.matchdayId);
      fd.append("matchId", m.id);

      fd.append("centralRefereeId", m.central);
      fd.append("aa1RefereeId", m.aa1);
      fd.append("aa2RefereeId", m.aa2);

      if (centralName) fd.append("centralRefereeName", centralName);
      if (aa1Name) fd.append("aa1RefereeName", aa1Name);
      if (aa2Name) fd.append("aa2RefereeName", aa2Name);

      // 4º árbitro y asesor: siempre se envían (vacío = el usuario los borró)
      // El server usa: clave ausente→conservar, vacío→null, valor→guardar
      fd.append("fourthRefereeId", m.fourth || "");
      if (m.fourth && fourthName) fd.append("fourthRefereeName", fourthName);

      fd.append("assessorRefereeId", m.assessor || "");
      if (m.assessor && assessorName) fd.append("assessorRefereeName", assessorName);

      if (options?.ignoreRecentTeamConflicts) {
        fd.append("ignoreRecentTeamConflicts", "true");
      }
      if (options?.ignoreSameDayConflicts) {
        fd.append("ignoreSameDayConflicts", "true");
      }

      const res = await assignManualTernaAction(fd);

      if (!res.ok) {
        toast.error(res.message ?? "No se pudo asignar la terna.");
        return;
      }

      const data = res.data;
      if (!data) {
        toast.error("Respuesta inesperada del servidor.");
        return;
      }

      // 🔹 Códigos de error/bloqueo “duro”
      if (data.code === "REFEREE_NOT_AVAILABLE") {
        toast.error(`Uno o más árbitros no están disponibles: ${(data.unavailableRefs ?? []).join(", ")}`);
        return;
      }
      if (data.code === "DUPLICATE_REFEREES") {
        toast.error(data.error ?? "Un árbitro no puede repetirse como central y asistente en la misma terna.");
        return;
      }

      if (data.code === "SCHEDULE_CONFLICT") {
        // Aquí NO damos opción de continuar: choque de horario = bloqueo duro
        toast.error(data.error ?? "Choque de horario: algún árbitro ya tiene otro partido en la misma fecha/hora.");

        return;
      }

      if (data.code === "RECENT_TEAM_CONFLICT") {
        const conflicts = data.conflicts ?? [];

        const details =
          conflicts.length === 0
            ? null
            : conflicts
                .map((c) => {
                  const refName = meta.referees.find((r) => r.id === c.refereeId)?.name ?? c.refereeId;
                  const roleLabel = c.refereeRole === "CENTRAL" ? "Central" : c.refereeRole === "AA1" ? "AA1" : "AA2";
                  const team = c.teamName || c.teamId;
                  const jornada = c.matchdayNumber ? `Jornada ${c.matchdayNumber}` : "";

                  return `${refName} (${roleLabel}) ya arbitró a ${team}${jornada ? ` en ${jornada}` : ""}`;
                })
                .join("\n");

        toast.error(
          <div className="text-left whitespace-pre-line">
            <strong>Conflicto detectado (últimas 4 jornadas):</strong>
            <br />
            {details ?? "Algún árbitro ya arbitró a este equipo recientemente."}
          </div>,
          {
            action: {
              label: "Continuar de todas formas",
              onClick: () => {
                // Segundo intento ignorando la regla de 4 jornadas
                void doAssign({ ignoreRecentTeamConflicts: true });
              },
            },
          },
        );
        return;
      }

      if (data.code === "SAME_DAY_CONFLICT") {
        const conflicts = data.sameDayConflicts ?? [];

        const details =
          conflicts.length === 0
            ? null
            : conflicts
                .map((c) => {
                  const refName = meta.referees.find((r) => r.id === c.refereeId)?.name ?? c.refereeId;
                  const vs = [c.otherHomeTeamName, c.otherAwayTeamName].filter(Boolean).join(" vs ");
                  return `${refName} (${c.refereeRole}) ya tiene partido ese día${vs ? `: ${vs}` : ""}`;
                })
                .join("\n");

        toast.error(
          <div className="text-left whitespace-pre-line">
            <strong>Conflicto: mismo día calendario</strong>
            <br />
            {details ?? "Algún árbitro ya tiene otro partido asignado el mismo día."}
          </div>,
          {
            action: {
              label: "Continuar de todas formas",
              onClick: () => {
                void doAssign({ ignoreSameDayConflicts: true });
              },
            },
          },
        );
        return;
      }

      if (data.code === "RCS_BELOW_THRESHOLD_BLOCK") {
        // Bloqueo por configuración de temporada
        toast.error(
          data.error ?? "Bloqueado: el RCS del central está por debajo del mínimo permitido para este partido.",
        );

        return;
      }

      // 🔹 Advertencia NO bloqueante (se guardó, pero se avisa)
      if (data.code === "RCS_BELOW_THRESHOLD_WARNING") {
        toast.info(
          data.error ?? "Advertencia: el RCS del central está por debajo del MDS recomendado para este partido.",
        );

        markSaved();
        return;
      }

      // 🔹 Éxito normal
      if (data.code === "OK") {
        toast.success("Terna asignada correctamente.");
        markSaved();
        return;
      }

      // Otros códigos genéricos (MISSING_PARAMS, MATCH_NOT_FOUND, etc.)
      toast.error(data.error ?? "Error al asignar la terna.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al asignar la terna.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    void doAssign();
  }

  return (
    <div className="px-3 py-2.5 text-center">
      <div className="flex flex-col items-center justify-center gap-1">
        <Button
          size="sm"
          variant={hasTerna ? "default" : "outline"}
          onClick={handleSave}
          disabled={saving || meta.isPendingGlobal}
        >
          {saving ? "Guardando…" : hasTerna ? "Actualizar" : "Asignar"}
        </Button>
        <Badge
          variant={justSaved ? "default" : hasTerna ? "default" : "outline"}
          className={cn(
            "mt-0.5 text-[10px]",
            justSaved
              ? "border-blue-200 bg-blue-100 text-blue-700"
              : hasTerna && "border-emerald-200 bg-emerald-100 text-emerald-700",
          )}
        >
          {justSaved ? "Guardado" : hasTerna ? "Terna completa" : "Sin terna"}
        </Badge>
      </div>
    </div>
  );
}
