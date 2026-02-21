// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/_components/match-card.tsx
"use client";

import * as React from "react";

import { useRouter, useParams } from "next/navigation";

import { BadgeCheck, CalendarDays, FlagTriangleRight, MapPin, NotebookPen, Trash2, Pencil, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

export function MatchCard({
  id,
  date,
  status,
  stadium,
  matchNumber,
  home,
  away,
  // añadidos
  docPath,
  realIds,
  assignments,
  editSlot,
}: {
  id: string;
  date: Date | null;
  status: string;
  stadium?: string | null;
  matchNumber?: number;
  home: TeamSide;
  away: TeamSide;

  // añadidos
  docPath?: string;
  realIds?: { leagueId?: string | null; groupId?: string | null; matchdayId?: string | null };
  assignments?: Assignments;
  /** Slot para inyectar botón externo (ej. "Editar terna") en el footer */
  editSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams<{ leagueId: string; groupId: string; matchdayId: string }>();

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [openDelete, setOpenDelete] = React.useState(false);

  const readableDate = date
    ? date.toLocaleString(undefined, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Fecha por definir";

  if (process.env.NEXT_PUBLIC_DEBUG_LOGOS === "1") {
    console.debug(
      "[MatchCard]",
      id,
      "home.logoUrl=",
      home.logoUrl ?? "EMPTY",
      "away.logoUrl=",
      away.logoUrl ?? "EMPTY",
    );
  }

  const isFinished = status === "FINISHED";
  const isLive = status === "LIVE";
  const isPostponed = status === "POSTPONED";

  const handleEdit = React.useCallback(() => {
    router.push(
      `/dashboard/leagues/${params.leagueId}/groups/${params.groupId}/matchdays/${params.matchdayId}/matches/${id}/edit`,
    );
  }, [id, params, router]);

  const handleDeleteConfirmed = React.useCallback(async () => {
    setIsDeleting(true);
    try {
      let ok = false;
      let message = "No se pudo eliminar el partido.";

      // 1) Preferir borrar por path directo si lo tenemos
      if (docPath) {
        const r = await fetch(`/api/firestore/delete-by-path`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: docPath }),
        });
        const j = await r.json().catch(() => ({}));
        ok = r.ok && j?.ok;
        message = j?.message ?? message;
      } else {
        // 2) Usar los IDs reales si venían del doc; fallback a params de la URL
        const leagueId = realIds?.leagueId ?? params.leagueId;
        const groupId = realIds?.groupId ?? params.groupId;
        const matchdayId = realIds?.matchdayId ?? params.matchdayId;

        const r = await fetch(`/api/leagues/${leagueId}/groups/${groupId}/matchdays/${matchdayId}/matches/${id}`, {
          method: "DELETE",
        });
        const j = await r.json().catch(() => ({}));
        ok = r.ok && j?.ok;
        message = j?.message ?? message;
      }

      if (!ok) throw new Error(message);

      toast.success("Partido eliminado correctamente.");
      router.refresh(); // recarga la lista
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al eliminar el partido.");
    } finally {
      setIsDeleting(false);
    }
  }, [docPath, realIds, id, params, router]);

  return (
    <>
      <Card className="group overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md">
        <CardContent className="space-y-4 p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] tracking-wide",
                  isLive && "bg-red-100 text-red-700",
                  isFinished && "bg-emerald-100 text-emerald-700",
                  isPostponed && "bg-amber-100 text-amber-800",
                )}
              >
                {status}
              </Badge>
              {typeof matchNumber === "number" && (
                <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[11px]">
                  #{matchNumber}
                </Badge>
              )}
            </div>

            {/* ID: discreto en desktop */}
            <div className="text-muted-foreground hidden text-[11px] sm:inline-flex">
              <span className="rounded-full border px-2 py-0.5">ID: {id}</span>
            </div>
          </div>

          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="font-medium">{readableDate}</span>
          </div>

          <Separator />

          {/* Equipos */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_minmax(36px,auto)_1fr] sm:items-center">
            <TeamRow side="left" team={home} />
            <div className="text-muted-foreground hidden sm:block">
              <div className="rounded-full border px-2 py-0.5 text-center text-xs font-semibold">vs</div>
            </div>
            <TeamRow side="right" team={away} />
          </div>

          {/* Sede */}
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="line-clamp-1">{stadium ?? "Sede por definir"}</span>
          </div>

          {/* Designaciones */}
          <Separator />
          <DesignationsSection a={assignments ?? {}} />

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-muted-foreground inline-flex text-[11px] sm:hidden">
              <span className="rounded-full border px-2 py-0.5">ID: {id}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {editSlot}
              <Button size="sm" variant="secondary" onClick={handleEdit}>
                <Pencil className="mr-1 h-4 w-4" />
                Editar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setOpenDelete(true)} disabled={isDeleting}>
                <Trash2 className="mr-1 h-4 w-4" />
                {isDeleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogo de confirmación reutilizable */}
      <ConfirmDeleteDialog
        open={openDelete}
        onOpenChange={setOpenDelete}
        onConfirm={handleDeleteConfirmed}
        title="¿Eliminar partido?"
        description="Esta acción eliminará el partido permanentemente y no se puede deshacer."
      />
    </>
  );
}

/* ---------- Subcomponentes ---------- */

function TeamRow({ team, side }: { team: TeamSide; side: "left" | "right" }) {
  const alignRight = side === "right";
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        alignRight ? "sm:justify-end" : "sm:justify-start",
        "justify-between sm:justify-normal",
      )}
    >
      {!alignRight && <TeamLogo logoUrl={team.logoUrl} />}

      <div className={cn("min-w-0", alignRight && "text-right")}>
        <div className="line-clamp-1 text-base leading-6 font-semibold xl:line-clamp-2">{team.name}</div>
        {typeof team.goals === "number" && (
          <div
            className={cn(
              "mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs",
              alignRight ? "sm:ml-auto" : "",
            )}
          >
            <span className="rounded border px-1.5 py-0.5 font-medium">Marcador: {team.goals}</span>
          </div>
        )}
      </div>

      {alignRight && <TeamLogo logoUrl={team.logoUrl} />}
    </div>
  );
}

/* ---------- Designaciones ---------- */

/**
 * Decide qué texto mostrar para un slot de árbitro.
 * Prioridad: etiqueta externa > nombre cacheado en el doc > "(árbitro)" si solo hay ID.
 */
function getAssigneeLabel({
  id,
  name,
  label,
}: {
  id?: string | null;
  name?: string | null;
  label?: string | null;
}): string | null {
  if (label) return label;
  if (name) return name;
  if (id) return "(árbitro)";
  return null;
}

function AssigneeRow({ icon, role, name }: { icon: React.ReactNode; role: string; name: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {icon}
      <span className="shrink-0 font-medium">{role}:</span>
      <span className="min-w-0 truncate">{name}</span>
    </div>
  );
}

function DesignationsSection({ a }: { a: Assignments }) {
  const central = getAssigneeLabel({
    id: a.centralRefereeId,
    name: a.centralRefereeName,
    label: a.centralExternalLabel,
  });
  const aa1 = getAssigneeLabel({ id: a.aa1RefereeId, name: a.aa1RefereeName, label: a.aa1ExternalLabel });
  const aa2 = getAssigneeLabel({ id: a.aa2RefereeId, name: a.aa2RefereeName, label: a.aa2ExternalLabel });
  const fourth = getAssigneeLabel({
    id: a.fourthRefereeId,
    name: a.fourthRefereeName,
    label: a.fourthExternalLabel,
  });
  const assessor = getAssigneeLabel({
    id: a.assessorRefereeId,
    name: a.assessorRefereeName,
    label: a.assessorExternalLabel,
  });

  const hasAny = central ?? aa1 ?? aa2 ?? fourth ?? assessor;

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Designaciones</p>
      {!hasAny ? (
        <p className="text-muted-foreground text-xs">Sin terna</p>
      ) : (
        <div className="space-y-1">
          {central && (
            <AssigneeRow icon={<BadgeCheck className="h-3.5 w-3.5 shrink-0" />} role="Central" name={central} />
          )}
          {aa1 && <AssigneeRow icon={<FlagTriangleRight className="h-3.5 w-3.5 shrink-0" />} role="AA1" name={aa1} />}
          {aa2 && <AssigneeRow icon={<FlagTriangleRight className="h-3.5 w-3.5 shrink-0" />} role="AA2" name={aa2} />}
          {fourth && <AssigneeRow icon={<User className="h-3.5 w-3.5 shrink-0" />} role="4º" name={fourth} />}
          {assessor && (
            <AssigneeRow icon={<NotebookPen className="h-3.5 w-3.5 shrink-0" />} role="Asesor" name={assessor} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Logo helpers ---------- */

function debugLogo(...args: unknown[]) {
  if (process.env.NEXT_PUBLIC_DEBUG_LOGOS === "1") {
    console.debug("[TeamLogo]", ...args);
  }
}

function normalizeLogoUrl(url?: string | null): string | null {
  if (!url) return null;

  // Trim + replace NBSP, zero-width spaces, and other exotic whitespace
  let cleaned = url.replace(/[\s\u00A0\u200B\uFEFF]+/g, " ").trim();
  if (!cleaned) return null;

  // gs:// URIs can't be rendered directly — need a download URL
  if (cleaned.startsWith("gs://")) {
    debugLogo("gs:// URI not renderable:", cleaned);
    return null;
  }

  // Upgrade http → https when we're on a secure page
  if (cleaned.startsWith("http://")) {
    cleaned = cleaned.replace(/^http:\/\//, "https://");
  }

  return cleaned;
}

function getLogoHost(src: string): string {
  try {
    return new URL(src).hostname;
  } catch {
    return "invalid";
  }
}

function TeamLogo({ logoUrl }: { logoUrl?: string | null }) {
  const src = normalizeLogoUrl(logoUrl);
  const [errored, setErrored] = React.useState(false);

  // Reset error state when URL changes
  React.useEffect(() => {
    setErrored(false);
  }, [src]);

  const showFallback = !src || errored;

  return (
    <div className="bg-background grid h-10 w-10 place-items-center overflow-hidden rounded-full border">
      {showFallback ? (
        <div className="h-5 w-5 rounded-full border" />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          data-logo-host={getLogoHost(src)}
          className="h-full w-full object-cover"
          onError={() => {
            debugLogo("load failed:", src, "host:", getLogoHost(src));
            setErrored(true);
          }}
        />
      )}
    </div>
  );
}
