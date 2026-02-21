"use client";

// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/_components/match-card-client.tsx

import * as React from "react";

import { useRouter } from "next/navigation";

import { Users2 } from "lucide-react";
import { toast } from "sonner";

import type { RefereeOption } from "@/app/(main)/dashboard/assignments/_components/assignments-types";
import { RefereeSelect } from "@/app/(main)/dashboard/assignments/_components/referee-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { assignManualTernaAction } from "@/server/actions/assignments.actions";

import { MatchCard } from "./match-card";

/* ---------- Types ---------- */

type TeamSide = {
  id?: string;
  name: string;
  logoUrl?: string;
  goals?: number;
};

type Assignments = {
  centralRefereeId?: string | null;
  centralExternalLabel?: string | null;
  centralRefereeName?: string | null;
  aa1RefereeId?: string | null;
  aa1ExternalLabel?: string | null;
  aa1RefereeName?: string | null;
  aa2RefereeId?: string | null;
  aa2ExternalLabel?: string | null;
  aa2RefereeName?: string | null;
  fourthRefereeId?: string | null;
  fourthExternalLabel?: string | null;
  fourthRefereeName?: string | null;
  assessorRefereeId?: string | null;
  assessorExternalLabel?: string | null;
  assessorRefereeName?: string | null;
};

export type MatchCardClientProps = {
  id: string;
  date: Date | null;
  status: string;
  stadium?: string | null;
  matchNumber?: number;
  home: TeamSide;
  away: TeamSide;
  docPath?: string;
  realIds?: { leagueId?: string | null; groupId?: string | null; matchdayId?: string | null };
  assignments?: Assignments;
  /** Needed for the save action */
  matchIds: { leagueId: string; groupId: string; matchdayId: string; matchId: string };
  referees: RefereeOption[];
  canEdit: boolean;
};

/* ---------- Helpers ---------- */

function getInitialValue(id?: string | null, label?: string | null): string {
  if (id) return id;
  if (label) return `ext:${label}`;
  return "";
}

function parseSlot(val: string): { id: string; label: string } {
  if (!val) return { id: "", label: "" };
  if (val.startsWith("ext:")) return { id: "", label: val.slice(4) };
  return { id: val, label: "" };
}

function isDirtyCheck(current: SlotValues, initial: SlotValues): boolean {
  return (
    current.central !== initial.central ||
    current.aa1 !== initial.aa1 ||
    current.aa2 !== initial.aa2 ||
    current.fourth !== initial.fourth ||
    current.assessor !== initial.assessor
  );
}

type SlotValues = {
  central: string;
  aa1: string;
  aa2: string;
  fourth: string;
  assessor: string;
};

function buildInitialSlots(a?: Assignments): SlotValues {
  if (!a) return { central: "", aa1: "", aa2: "", fourth: "", assessor: "" };
  return {
    central: getInitialValue(a.centralRefereeId, a.centralExternalLabel),
    aa1: getInitialValue(a.aa1RefereeId, a.aa1ExternalLabel),
    aa2: getInitialValue(a.aa2RefereeId, a.aa2ExternalLabel),
    fourth: getInitialValue(a.fourthRefereeId, a.fourthExternalLabel),
    assessor: getInitialValue(a.assessorRefereeId, a.assessorExternalLabel),
  };
}

/* ---------- Component ---------- */

export function MatchCardClient({
  id,
  date,
  status,
  stadium,
  matchNumber,
  home,
  away,
  docPath,
  realIds,
  assignments,
  matchIds,
  referees,
  canEdit,
}: MatchCardClientProps) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Slot values for the dialog selects
  const initialSlots = React.useMemo(() => buildInitialSlots(assignments), [assignments]);
  const [slots, setSlots] = React.useState<SlotValues>(initialSlots);

  // Re-sync when dialog opens (picks up fresh assignments from server re-render)
  React.useEffect(() => {
    if (open) setSlots(buildInitialSlots(assignments));
  }, [open, assignments]);

  const isDirty = isDirtyCheck(slots, initialSlots);

  const isAllEmpty = !slots.central && !slots.aa1 && !slots.aa2 && !slots.fourth && !slots.assessor;

  function set(field: keyof SlotValues) {
    return (v: string) => setSlots((prev) => ({ ...prev, [field]: v }));
  }

  async function handleSave() {
    // Partial terna guard: allow all-empty (clear) or full central+aa1+aa2
    if (!isAllEmpty && (!slots.central || !slots.aa1 || !slots.aa2)) {
      toast.error("Debes seleccionar Central y los dos Asistentes (o dejar todo vacío para borrar la terna).");
      return;
    }

    try {
      setSaving(true);

      const fd = new FormData();
      fd.append("leagueId", matchIds.leagueId);
      fd.append("groupId", matchIds.groupId);
      fd.append("matchdayId", matchIds.matchdayId);
      fd.append("matchId", matchIds.matchId);

      const c = parseSlot(slots.central);
      const a1 = parseSlot(slots.aa1);
      const a2 = parseSlot(slots.aa2);
      const f = parseSlot(slots.fourth);
      const as = parseSlot(slots.assessor);

      fd.append("centralRefereeId", c.id);
      fd.append("centralExternalLabel", c.label);
      fd.append("aa1RefereeId", a1.id);
      fd.append("aa1ExternalLabel", a1.label);
      fd.append("aa2RefereeId", a2.id);
      fd.append("aa2ExternalLabel", a2.label);

      // Cached names for display
      const nameOf = (id: string) => referees.find((r) => r.id === id)?.name ?? "";
      if (c.id) fd.append("centralRefereeName", nameOf(c.id));
      if (a1.id) fd.append("aa1RefereeName", nameOf(a1.id));
      if (a2.id) fd.append("aa2RefereeName", nameOf(a2.id));

      // Fourth and assessor: always send (empty = clear)
      fd.append("fourthRefereeId", f.id);
      fd.append("fourthExternalLabel", f.label);
      if (f.id) fd.append("fourthRefereeName", nameOf(f.id));

      fd.append("assessorRefereeId", as.id);
      fd.append("assessorExternalLabel", as.label);
      if (as.id) fd.append("assessorRefereeName", nameOf(as.id));

      const res = await assignManualTernaAction(fd);

      if (!res.ok) {
        toast.error(res.message ?? "No se pudo guardar la terna.");
        return;
      }

      const data = res.data;
      if (!data) {
        toast.error("Respuesta inesperada del servidor.");
        return;
      }

      // Hard blocks
      if (
        data.code === "MISSING_PARAMS" ||
        data.code === "MATCH_NOT_FOUND" ||
        data.code === "DUPLICATE_REFEREES" ||
        data.code === "REFEREE_NOT_AVAILABLE" ||
        data.code === "SCHEDULE_CONFLICT" ||
        data.code === "RCS_BELOW_THRESHOLD_BLOCK"
      ) {
        toast.error((data as any).error ?? "Error al guardar la terna.");
        return;
      }

      if (data.code === "RECENT_TEAM_CONFLICT" || data.code === "SAME_DAY_CONFLICT") {
        toast.warning(
          (data as any).error ?? "Conflicto detectado. Guarda desde la tabla de designaciones para omitirlo.",
        );
        return;
      }

      if (data.code === "RCS_BELOW_THRESHOLD_WARNING") {
        toast.info((data as any).error ?? "Advertencia de RCS, pero la terna fue guardada.");
      } else {
        toast.success(isAllEmpty ? "Terna borrada correctamente." : "Terna guardada correctamente.");
      }

      setOpen(false);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al guardar la terna.");
    } finally {
      setSaving(false);
    }
  }

  const editButton = canEdit ? (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label="Editar terna">
      <Users2 className="mr-1 h-4 w-4" />
      Editar terna
    </Button>
  ) : null;

  return (
    <>
      <MatchCard
        id={id}
        date={date}
        status={status}
        stadium={stadium}
        matchNumber={matchNumber}
        home={home}
        away={away}
        docPath={docPath}
        realIds={realIds}
        assignments={assignments}
        editSlot={editButton}
      />

      {canEdit && (
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (!saving) setOpen(v);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar terna</DialogTitle>
              <DialogDescription>
                {home.name} vs {away.name}. Los cambios se guardarán en el partido.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <SlotRow
                label="Central"
                value={slots.central}
                onChange={set("central")}
                referees={referees}
                mode="ARBITRO"
                disabled={saving}
              />
              <SlotRow
                label="Asistente 1 (AA1)"
                value={slots.aa1}
                onChange={set("aa1")}
                referees={referees}
                mode="ARBITRO"
                disabled={saving}
              />
              <SlotRow
                label="Asistente 2 (AA2)"
                value={slots.aa2}
                onChange={set("aa2")}
                referees={referees}
                mode="ARBITRO"
                disabled={saving}
              />
              <SlotRow
                label="4º Árbitro (opcional)"
                value={slots.fourth}
                onChange={set("fourth")}
                referees={referees}
                mode="ARBITRO"
                disabled={saving}
              />
              <SlotRow
                label="Asesor (opcional)"
                value={slots.assessor}
                onChange={set("assessor")}
                referees={referees}
                mode="ASESOR"
                disabled={saving}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? "Guardando…" : isDirty ? "Guardar cambios" : "Sin cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ---------- SlotRow ---------- */

type SlotRowProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  referees: RefereeOption[];
  mode: "ARBITRO" | "ASESOR" | "ALL";
  disabled?: boolean;
};

function SlotRow({ label, value, onChange, referees, mode, disabled }: SlotRowProps) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <Label className="text-right text-sm">{label}</Label>
      <div className={disabled ? "pointer-events-none opacity-50" : undefined}>
        <RefereeSelect value={value} onChange={onChange} referees={referees} placeholder={label} mode={mode} />
      </div>
    </div>
  );
}
