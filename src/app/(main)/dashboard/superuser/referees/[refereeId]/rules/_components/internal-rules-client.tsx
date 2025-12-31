"use client";

import * as React from "react";
import { useTransition } from "react";

import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { InternalRuleInputZ, type InternalRule, type InternalRuleInput } from "@/domain/referees/internal-rule.zod";
import {
  createInternalRuleAction,
  updateInternalRuleAction,
  deleteInternalRuleAction,
  toggleInternalRuleEnabledAction,
} from "@/server/actions/internal-rules.actions";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type BasicRef = {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  zones?: string[];
  rolesAllowed?: string[];
  delegateId?: string | null; // ✅ Multi-tenant
};

type Props = {
  referee: BasicRef;
  initialRules: InternalRule[];
};

/* ------------------------------------------------------------------ */
/* MultiSelect simple                                                 */
/* ------------------------------------------------------------------ */

type Option = { value: string; label: string };

type MultiSelectProps = {
  label?: string;
  placeholder?: string;
  options: Option[];
  value: string[];
  loading?: boolean;
  onChange: (next: string[]) => void;
};

function MultiSelect({ label, placeholder, options, value, loading, onChange }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggle = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  return (
    <div className="space-y-1">
      {label ? <Label>{label}</Label> : null}
      <div className="relative">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="truncate text-left">
            {value.length === 0
              ? (placeholder ?? "Selecciona…")
              : options
                  .filter((o) => value.includes(o.value))
                  .map((o) => o.label)
                  .join(", ")}
          </span>
          <span className="text-muted-foreground ml-2 text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="bg-background absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border text-sm shadow-md">
            {loading ? (
              <div className="text-muted-foreground px-3 py-2">Cargando…</div>
            ) : options.length === 0 ? (
              <div className="text-muted-foreground px-3 py-2">Sin opciones</div>
            ) : (
              options.map((opt) => {
                const checked = value.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="hover:bg-muted flex w-full items-center justify-between px-3 py-1.5 text-left"
                    onClick={() => toggle(opt.value)}
                  >
                    <span>{opt.label}</span>
                    <input type="checkbox" readOnly checked={checked} className="h-3 w-3" />
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                               */
/* ------------------------------------------------------------------ */

export function InternalRulesClient({ referee, initialRules }: Props) {
  const [rules, setRules] = React.useState<InternalRule[]>(initialRules ?? []);
  const [pending, startTransition] = useTransition();
  const { addToast } = useToast();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<InternalRule | null>(null);

  const handleSave = (input: InternalRuleInput) => {
    startTransition(async () => {
      try {
        if (editingRule) {
          const res = await updateInternalRuleAction({
            refereeId: referee.id,
            ruleId: editingRule.id,
            rule: input,
          });

          if (!res.ok) {
            addToast({ variant: "destructive", description: res.message });
            return;
          }

          setRules((prev) => prev.map((r) => (r.id === res.data.id ? res.data : r)));
          addToast({ description: "Regla actualizada." });
        } else {
          const res = await createInternalRuleAction({
            refereeId: referee.id,
            rule: input,
          });

          if (!res.ok) {
            addToast({ variant: "destructive", description: res.message });
            return;
          }

          setRules((prev) => [...prev, res.data]);
          addToast({ description: "Regla creada." });
        }

        setDialogOpen(false);
        setEditingRule(null);
      } catch (e: any) {
        addToast({ variant: "destructive", description: "Error al guardar la regla." });
      }
    });
  };

  const handleDelete = (rule: InternalRule) => {
    if (!window.confirm("¿Eliminar esta regla interna?")) return;

    startTransition(async () => {
      const res = await deleteInternalRuleAction({ refereeId: referee.id, ruleId: rule.id });
      if (!res.ok) {
        addToast({ variant: "destructive", description: res.message });
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      addToast({ description: "Regla eliminada." });
    });
  };

  const handleToggle = (rule: InternalRule) => {
    startTransition(async () => {
      const res = await toggleInternalRuleEnabledAction({
        refereeId: referee.id,
        ruleId: rule.id,
        enabled: !rule.enabled,
      });

      if (!res.ok) {
        addToast({ variant: "destructive", description: res.message });
        return;
      }

      setRules((prev) => prev.map((r) => (r.id === res.data.id ? res.data : r)));
    });
  };

  const openNewRuleDialog = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const openEditDialog = (rule: InternalRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reglas internas RA-XX</h2>
          <p className="text-muted-foreground text-sm">
            Configura municipios, días, equipos, ligas y compañeros preferidos/prohibidos para el motor de
            auto-sugerencia.
          </p>
        </div>
        <Button size="sm" onClick={openNewRuleDialog} disabled={pending}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva regla
        </Button>
      </div>

      {/* Tabla simple */}
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">Este árbitro no tiene reglas internas configuradas.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Detalle</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Última actualización</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 align-top">
                    <Badge variant="outline">{r.type}</Badge>
                  </td>
                  <td className="px-3 py-2 align-top">{renderRuleParamsSummary(r)}</td>
                  <td className="px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                    >
                      {r.enabled ? (
                        <>
                          <ToggleRight className="h-4 w-4" /> Activa
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-4 w-4" /> Inactiva
                        </>
                      )}
                    </button>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 align-top text-xs">
                    <div>
                      {(() => {
                        const raw = (r as any).updatedAt;

                        if (!raw) return "";

                        if (typeof raw.toDate === "function") {
                          return raw.toDate().toLocaleString();
                        }

                        try {
                          return new Date(raw).toLocaleString();
                        } catch {
                          return String(raw);
                        }
                      })()}
                    </div>

                    {r.updatedBy && <div>Por: {r.updatedBy}</div>}
                    {r.reason && <div>Motivo: {r.reason}</div>}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEditDialog(r)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleDelete(r)}
                        disabled={pending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog crear/editar */}
      <RuleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingRule(null);
        }}
        initialRule={editingRule}
        onSave={handleSave}
        pending={pending}
        referee={referee}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resumen de params en la tabla                                      */
/* ------------------------------------------------------------------ */

function renderRuleParamsSummary(rule: InternalRule) {
  const p: any = rule.params;
  switch (rule.type) {
    case "RA_municipios_prohibidos":
    case "RA_municipios_preferidos":
      return (
        <div className="space-y-1">
          <div>Municipios: {(p.municipios ?? []).join(", ")}</div>
          {typeof p.pesoExtra === "number" && <div>Peso extra: +{p.pesoExtra}</div>}
          {p.comentario && <div className="text-muted-foreground text-xs">{p.comentario}</div>}
        </div>
      );
    case "RA_dias_prohibidos":
    case "RA_dias_preferidos":
      return (
        <div className="space-y-1">
          <div>Días: {(p.dias ?? []).join(", ")}</div>
          {p.comentario && <div className="text-muted-foreground text-xs">{p.comentario}</div>}
        </div>
      );
    case "RA_equipos_prohibidos":
    case "RA_equipos_preferidos":
      return (
        <div className="space-y-1">
          <div>Equipos: {(p.teamIds ?? []).join(", ")}</div>
          {typeof p.pesoExtra === "number" && <div>Peso extra: +{p.pesoExtra}</div>}
          {p.comentario && <div className="text-muted-foreground text-xs">{p.comentario}</div>}
        </div>
      );
    case "RA_ligas_prohibidas":
      return (
        <div className="space-y-1">
          <div>Ligas: {(p.leagueIds ?? []).join(", ")}</div>
          {p.comentario && <div className="text-muted-foreground text-xs">{p.comentario}</div>}
        </div>
      );
    case "RA_companeros_preferidos":
      return (
        <div className="space-y-1">
          <div>Compañeros: {(p.refereeIds ?? []).join(", ")}</div>
          {typeof p.pesoExtra === "number" && <div>Peso extra: +{p.pesoExtra}</div>}
          {p.comentario && <div className="text-muted-foreground text-xs">{p.comentario}</div>}
        </div>
      );
    case "RA_companeros_obligatorios":
      return (
        <div className="space-y-1">
          <div>Compañeros obligatorios: {(p.refereeIds ?? []).join(", ")}</div>
          {p.comentario && <div className="text-muted-foreground text-xs">{p.comentario}</div>}
        </div>
      );

    default:
      return <span className="text-muted-foreground text-xs">Tipo no soportado aún en el resumen.</span>;
  }
}

/* ------------------------------------------------------------------ */
/* RuleDialog                                                         */
/* ------------------------------------------------------------------ */
type RuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRule: InternalRule | null;
  pending: boolean;
  onSave: (input: InternalRuleInput) => void;
  referee: BasicRef;
};

function RuleDialog({ open, onOpenChange, initialRule, onSave, pending, referee }: RuleDialogProps) {
  const isEdit = !!initialRule;

  const [type, setType] = React.useState<string>(initialRule?.type ?? "RA_municipios_prohibidos");

  const [municipios, setMunicipios] = React.useState<string[]>(
    Array.isArray((initialRule as any)?.params?.municipios) ? (initialRule as any).params.municipios : [],
  );
  const [dias, setDias] = React.useState<string>(
    Array.isArray((initialRule as any)?.params?.dias) ? (initialRule as any).params.dias.join(",") : "",
  );
  const [teams, setTeams] = React.useState<string[]>(
    Array.isArray((initialRule as any)?.params?.teamIds) ? (initialRule as any).params.teamIds : [],
  );
  const [pesoExtra, setPesoExtra] = React.useState<string>(
    typeof (initialRule as any)?.params?.pesoExtra === "number" ? String((initialRule as any).params.pesoExtra) : "1",
  );
  const [comentario, setComentario] = React.useState<string>((initialRule as any)?.params?.comentario ?? "");
  const [enabled, setEnabled] = React.useState<boolean>(initialRule?.enabled ?? true);
  const [reason, setReason] = React.useState<string>("");

  // AHORA como arrays, porque usamos MultiSelect
  const [leagueIds, setLeagueIds] = React.useState<string[]>(
    Array.isArray((initialRule as any)?.params?.leagueIds) ? (initialRule as any).params.leagueIds : [],
  );
  const [refereeIds, setRefereeIds] = React.useState<string[]>(
    Array.isArray((initialRule as any)?.params?.refereeIds) ? (initialRule as any).params.refereeIds : [],
  );

  // Opciones de municipios (usando /api/catalogs/zones)
  const [zoneOptions, setZoneOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [zonesLoading, setZonesLoading] = React.useState(false);

  // Opciones de equipos (usando /api/catalogs/teams-simple)
  const [teamOptions, setTeamOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [teamsLoading, setTeamsLoading] = React.useState(false);

  // NUEVO: opciones de ligas (usando src/app/api/leagues/route.ts -> /api/leagues)
  const [leagueOptions, setLeagueOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [leaguesLoading, setLeaguesLoading] = React.useState(false);

  // NUEVO: opciones de árbitros (ej. /api/catalogs/referees-simple)
  const [refereeOptions, setRefereeOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [refereesLoading, setRefereesLoading] = React.useState(false);

  // Reset de estado cuando se abre/cambia la regla
  React.useEffect(() => {
    if (!open) return;

    if (!initialRule) {
      setType("RA_municipios_prohibidos");
      setMunicipios([]);
      setDias("");
      setTeams([]);
      setPesoExtra("1");
      setComentario("");
      setEnabled(true);
      setReason("");
      setLeagueIds([]);
      setRefereeIds([]);
      return;
    }

    setType(initialRule.type);
    const p: any = initialRule.params ?? {};
    setMunicipios(Array.isArray(p.municipios) ? p.municipios : []);
    setDias(Array.isArray(p.dias) ? p.dias.join(",") : "");
    setTeams(Array.isArray(p.teamIds) ? p.teamIds : []);
    setPesoExtra(typeof p.pesoExtra === "number" ? String(p.pesoExtra) : "1");
    setComentario(p.comentario ?? "");
    setEnabled(initialRule.enabled);
    setLeagueIds(Array.isArray(p.leagueIds) ? p.leagueIds : []);
    setRefereeIds(Array.isArray(p.refereeIds) ? p.refereeIds : []);
    setReason("");
  }, [open, initialRule]);

  // Cargar zonas cuando se abre el diálogo
  React.useEffect(() => {
    if (!open) return;

    const fetchZones = async () => {
      try {
        setZonesLoading(true);
        const res = await fetch("/api/catalogs/zones");
        if (!res.ok) {
          console.error("Error al cargar zonas", await res.text());
          return;
        }
        const json = (await res.json()) as { id: string; name: string }[];
        setZoneOptions(json);
      } catch (e) {
        console.error("Error de red al cargar zonas", e);
      } finally {
        setZonesLoading(false);
      }
    };

    fetchZones();
  }, [open]);

  // Cargar equipos filtrados por delegateId cuando se abre el diálogo
  React.useEffect(() => {
    if (!open) return;

    const fetchTeams = async () => {
      try {
        setTeamsLoading(true);
        // ✅ Multi-tenant: filtrar por delegateId del referee
        const url = referee.delegateId
          ? `/api/catalogs/teams-simple?delegateId=${encodeURIComponent(referee.delegateId)}`
          : "/api/catalogs/teams-simple";
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok: boolean;
          teams: { id: string; name: string }[];
        };
        if (!json.ok) return;
        setTeamOptions(json.teams ?? []);
      } finally {
        setTeamsLoading(false);
      }
    };

    fetchTeams();
  }, [open, referee.delegateId]);

  // Cargar ligas filtradas por delegateId
  React.useEffect(() => {
    if (!open) return;

    const fetchLeagues = async () => {
      try {
        setLeaguesLoading(true);
        // ✅ Multi-tenant: filtrar por delegateId del referee
        const url = referee.delegateId
          ? `/api/leagues?delegateId=${encodeURIComponent(referee.delegateId)}`
          : "/api/leagues";
        const res = await fetch(url);
        if (!res.ok) {
          console.error("Error al cargar ligas", await res.text());
          return;
        }

        // Ajusta según lo que devuelva tu route.ts
        const json = await res.json();
        const leagues: { id: string; name: string }[] = Array.isArray(json) ? json : (json.leagues ?? []);

        setLeagueOptions(leagues);
      } catch (e) {
        console.error("Error de red al cargar ligas", e);
      } finally {
        setLeaguesLoading(false);
      }
    };

    fetchLeagues();
  }, [open, referee.delegateId]);

  // 🔥 Cargar árbitros simples para "compañeros preferidos"
  React.useEffect(() => {
    if (!open) return;

    const fetchRefs = async () => {
      try {
        setRefereesLoading(true);
        // ✅ Multi-tenant: filtrar por delegateId del referee
        const url = referee.delegateId
          ? `/api/catalogs/referees-simple?delegateId=${encodeURIComponent(referee.delegateId)}`
          : "/api/catalogs/referees-simple";
        const res = await fetch(url);
        if (!res.ok) {
          console.error("Error al cargar árbitros", await res.text());
          return;
        }
        const json = await res.json();
        const refs: { id: string; name: string }[] = Array.isArray(json) ? json : (json.referees ?? []);

        setRefereeOptions(refs);
      } catch (e) {
        console.error("Error de red al cargar árbitros", e);
      } finally {
        setRefereesLoading(false);
      }
    };

    fetchRefs();
  }, [open, referee.delegateId]);

  const splitTrimmed = (input: string): string[] =>
    input
      .split(",")
      .map((part: string): string => part.trim())
      .filter((part: string): boolean => part.length > 0);

  const handleSubmit = () => {
    const trimmedMunicipios = municipios.map((m) => m.trim()).filter((m) => m.length > 0);
    const trimmedDias = splitTrimmed(dias).map((d) => d.toUpperCase());
    const trimmedTeams = teams.map((t) => t.trim()).filter((t) => t.length > 0);
    const trimmedLeagueIds = leagueIds.map((id) => id.trim()).filter((id) => id.length > 0);
    const trimmedRefereeIds = refereeIds.map((id) => id.trim()).filter((id) => id.length > 0);

    let payload: any;

    if (type === "RA_ligas_prohibidas") {
      payload = {
        type,
        params: {
          leagueIds: trimmedLeagueIds,
          comentario: comentario || undefined,
        },
      };
    } else if (type === "RA_municipios_prohibidos") {
      payload = {
        type,
        params: {
          municipios: trimmedMunicipios,
          comentario: comentario || undefined,
        },
      };
    } else if (type === "RA_municipios_preferidos") {
      payload = {
        type,
        params: {
          municipios: trimmedMunicipios,
          comentario: comentario || undefined,
          pesoExtra: Number(pesoExtra || "1"),
        },
      };
    } else if (type === "RA_dias_prohibidos" || type === "RA_dias_preferidos") {
      payload = {
        type,
        params: {
          dias: trimmedDias,
          comentario: comentario || undefined,
        },
      };
    } else if (type === "RA_equipos_prohibidos") {
      payload = {
        type,
        params: {
          teamIds: trimmedTeams,
          comentario: comentario || undefined,
        },
      };
    } else if (type === "RA_equipos_preferidos") {
      payload = {
        type,
        params: {
          teamIds: trimmedTeams,
          comentario: comentario || undefined,
          pesoExtra: Number(pesoExtra || "1"),
        },
      };
    } else if (type === "RA_companeros_preferidos") {
      payload = {
        type,
        params: {
          refereeIds: trimmedRefereeIds,
          comentario: comentario || undefined,
          pesoExtra: Number(pesoExtra || "1"),
        },
      };
    } else if (type === "RA_companeros_obligatorios") {
      payload = {
        type,
        params: {
          refereeIds: trimmedRefereeIds,
          comentario: comentario || undefined,
        },
      };
    }

    const result = InternalRuleInputZ.safeParse({
      ...payload,
      enabled,
      reason: reason || undefined,
    });

    if (!result.success) {
      alert(result.error.errors[0]?.message ?? "Datos inválidos.");
      return;
    }

    onSave(result.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar regla interna" : "Nueva regla interna"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de regla</Label>
            <Select value={type} onValueChange={(v) => setType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RA_municipios_prohibidos">Municipios prohibidos</SelectItem>
                <SelectItem value="RA_municipios_preferidos">Municipios preferidos</SelectItem>
                <SelectItem value="RA_dias_prohibidos">Días prohibidos</SelectItem>
                <SelectItem value="RA_dias_preferidos">Días preferidos</SelectItem>
                <SelectItem value="RA_equipos_prohibidos">Equipos prohibidos</SelectItem>
                <SelectItem value="RA_equipos_preferidos">Equipos preferidos</SelectItem>
                <SelectItem value="RA_ligas_prohibidas">Ligas prohibidas</SelectItem>
                <SelectItem value="RA_companeros_preferidos">Compañeros preferidos</SelectItem>
                <SelectItem value="RA_companeros_obligatorios">Compañeros obligatorios</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Municipios */}
          {type.startsWith("RA_municipios") && (
            <MultiSelect
              label="Municipios"
              placeholder="Selecciona municipios…"
              options={zoneOptions.map((z) => ({ value: z.name, label: z.name }))}
              value={municipios}
              loading={zonesLoading}
              onChange={setMunicipios}
            />
          )}

          {/* Días */}
          {type.startsWith("RA_dias") && (
            <div className="space-y-2">
              <Label>Días (L,M,X,J,V,S,D separados por coma)</Label>
              <Input placeholder="S,D" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          )}

          {/* Equipos */}
          {type.startsWith("RA_equipos") && (
            <MultiSelect
              label="Equipos"
              placeholder="Selecciona equipos…"
              options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
              value={teams}
              loading={teamsLoading}
              onChange={setTeams}
            />
          )}

          {/* Ligas prohibidas */}
          {type === "RA_ligas_prohibidas" && (
            <MultiSelect
              label="Ligas"
              placeholder="Selecciona ligas…"
              options={leagueOptions.map((l) => ({ value: l.id, label: l.name }))}
              value={leagueIds}
              loading={leaguesLoading}
              onChange={setLeagueIds}
            />
          )}

          {/* Compañeros (preferidos u obligatorios) */}
          {(type === "RA_companeros_preferidos" || type === "RA_companeros_obligatorios") && (
            <MultiSelect
              label={type === "RA_companeros_preferidos" ? "Árbitros preferidos" : "Árbitros obligatorios"}
              placeholder="Selecciona árbitros…"
              options={refereeOptions.map((r) => ({ value: r.id, label: r.name }))}
              value={refereeIds}
              loading={refereesLoading}
              onChange={setRefereeIds}
            />
          )}

          {/* Peso extra para preferidos */}
          {(type === "RA_municipios_preferidos" ||
            type === "RA_equipos_preferidos" ||
            type === "RA_companeros_preferidos") && (
            <div className="space-y-2">
              <Label>Peso extra (1 = neutro, &gt; 1 = más prioridad)</Label>
              <Input
                type="number"
                step="0.1"
                min={0.1}
                max={10}
                value={pesoExtra}
                onChange={(e) => setPesoExtra(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Comentario interno</Label>
            <Textarea
              rows={3}
              placeholder="Motivo o contexto de esta regla (solo visible para SUPERUSUARIO)."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Motivo de este cambio (auditoría)</Label>
            <Input
              placeholder="Ej. ajuste por rendimiento reciente, reporte de delegado, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <input
              id="enabled"
              type="checkbox"
              className="h-4 w-4"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <Label htmlFor="enabled">Regla activa</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {isEdit ? "Guardar cambios" : "Crear regla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
