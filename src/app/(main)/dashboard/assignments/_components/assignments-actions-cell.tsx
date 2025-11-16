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

  // La terna "completa" sigue siendo central + AA1 + AA2; 4º y asesor son opcionales
  const hasTerna = Boolean(m.central && m.aa1 && m.aa2);

  async function handleSave() {
    if (!m.central || !m.aa1 || !m.aa2) {
      toast.error("Debes seleccionar al menos Central y los dos Asistentes.");
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

      // Nuevos campos opcionales
      if (m.fourth) {
        fd.append("fourthRefereeId", m.fourth);
        if (fourthName) fd.append("fourthRefereeName", fourthName);
      }

      if (m.assessor) {
        fd.append("assessorRefereeId", m.assessor);
        if (assessorName) fd.append("assessorRefereeName", assessorName);
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

      if (data.code === "OK") {
        toast.success("Terna asignada correctamente.");
        meta.onSaved();
        return;
      }

      if (data.code === "REFEREE_NOT_AVAILABLE") {
        toast.error(`Uno o más árbitros no están disponibles: ${(data.unavailableRefs ?? []).join(", ")}`);
        return;
      }

      if (data.code === "RECENT_TEAM_CONFLICT") {
        toast.error(data.error ?? "Conflicto con equipos en últimas 4 jornadas.");
        console.log("Conflictos:", data.conflicts);
        return;
      }

      toast.error(data.error ?? "Error al asignar la terna.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al asignar la terna.");
    } finally {
      setSaving(false);
    }
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
          variant={hasTerna ? "default" : "outline"}
          className={cn("mt-0.5 text-[10px]", hasTerna && "border-emerald-200 bg-emerald-100 text-emerald-700")}
        >
          {hasTerna ? "Terna completa" : "Sin terna"}
        </Badge>
      </div>
    </div>
  );
}
