"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { X, ChevronsUpDown, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefereeCreateZ, RefereeUpdateZ, RefRoleZ, RefStatusZ, RefCategoryZ } from "@/domain/referees/referee.zod";
import { createRefereeAction, updateRefereeAction } from "@/server/actions/referees.actions";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers de UI: SegmentedField genérico
// ───────────────────────────────────────────────────────────────────────────────
function SegmentedField<T extends string>({
  value,
  onChange,
  options,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className="w-full" aria-label={ariaLabel}>
      <TabsList className="grid w-full grid-cols-3 md:inline-grid md:w-auto md:auto-cols-fr md:grid-flow-col">
        {options.map((opt) => (
          <TabsTrigger key={opt} value={opt} disabled={disabled} className="text-xs md:text-sm">
            {opt}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Pills para roles permitidos
// ───────────────────────────────────────────────────────────────────────────────
function RolesPills({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
}) {
  const ALL = RefRoleZ.options;

  const toggle = (role: string) => {
    const set = new Set(value ?? []);
    if (set.has(role)) {
      set.delete(role);
    } else {
      set.add(role);
    }
    onChange(Array.from(set));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ALL.map((r) => {
        const active = (value ?? []).includes(r);
        const classes = [
          "rounded-full border px-3 py-1 text-xs transition md:text-sm",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 text-foreground hover:bg-muted",
          disabled ? "cursor-not-allowed opacity-50" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            type="button"
            key={r}
            onClick={() => toggle(r)}
            disabled={disabled}
            className={classes}
            aria-pressed={active}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// ComboBox multiselect de Zonas
// ───────────────────────────────────────────────────────────────────────────────
type Zone = { id: string; name: string };

function useZonesCatalog() {
  const [zones, setZones] = React.useState<Zone[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/catalogs/zones?active=true", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("No se pudo cargar el catálogo de zonas");
        }
        const data = (await res.json()) as Array<{ id: string; name: string }>;
        if (mounted) {
          setZones(data ?? []);
        }
      } catch {
        if (mounted) {
          setZones([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return { zones, loading };
}

function ZonesMultiCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Buscar y seleccionar zonas...",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { zones, loading } = useZonesCatalog();
  const [open, setOpen] = React.useState(false);

  const selectedSet = React.useMemo(() => new Set(value ?? []), [value]);

  const toggle = (id: string) => {
    const set = new Set(selectedSet);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    onChange(Array.from(set));
  };

  const clearOne = (id: string) => {
    const set = new Set(selectedSet);
    set.delete(id);
    onChange(Array.from(set));
  };

  const selectedZones = React.useMemo(() => zones.filter((z) => selectedSet.has(z.id)), [zones, selectedSet]);

  const selectedContent =
    selectedZones.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {selectedZones.map((z) => (
          <Badge key={z.id} variant="secondary" className="gap-1">
            {z.name}
            <button
              type="button"
              onClick={() => clearOne(z.id)}
              className="hover:bg-muted ml-1 rounded-sm"
              aria-label={`Quitar ${z.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    ) : (
      <p className="text-muted-foreground text-xs">Sin zonas seleccionadas</p>
    );

  let listContent: React.ReactNode;
  if (loading) {
    listContent = <CommandEmpty>Cargando...</CommandEmpty>;
  } else if (zones.length === 0) {
    listContent = <CommandEmpty>No hay zonas</CommandEmpty>;
  } else {
    listContent = (
      <CommandGroup>
        {zones.map((z) => {
          const checked = selectedSet.has(z.id);
          return (
            <CommandItem key={z.id} onSelect={() => toggle(z.id)} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox checked={checked} onCheckedChange={() => toggle(z.id)} />
                <span>{z.name}</span>
              </div>
              {checked ? <Check className="h-4 w-4" /> : null}
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  }

  const buttonLabel = `${placeholder}${value?.length ? ` (${value.length})` : ""}`;

  return (
    <div className="space-y-2">
      {selectedContent}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {buttonLabel}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Escribe para buscar..." />
            <CommandList>{listContent}</CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Componente principal del formulario
// ───────────────────────────────────────────────────────────────────────────────
type Props = { initial?: any; canEdit?: boolean };

export function RefereeForm({ initial, canEdit = true }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const schema = React.useMemo(() => (isEdit ? RefereeUpdateZ : RefereeCreateZ) as z.ZodType<any>, [isEdit]);

  const sanitizeInitial = React.useCallback((i: any) => {
    if (!i) return i;
    return {
      id: i.id,
      name: i.name ?? "",
      zones: Array.isArray(i.zones) ? i.zones : [],
      rolesAllowed: Array.isArray(i.rolesAllowed) ? i.rolesAllowed : [],
      status: i.status ?? "DISPONIBLE",
      category: i.category ?? "TDP",
      phone: i.phone ?? "",
      email: i.email ?? "",
      badgeNumber: i.badgeNumber ?? "",
      rfc: i.rfc ?? "",
      curp: i.curp ?? "",
      photoUrl: i.photoUrl ?? "",
      canAssess: !!i.canAssess,
    };
  }, []);

  const newDefaults = React.useMemo(
    () => ({
      name: "",
      zones: [],
      rolesAllowed: [],
      status: "DISPONIBLE" as z.infer<typeof RefStatusZ>,
      category: "TDP" as z.infer<typeof RefCategoryZ>,
      phone: "",
      email: "",
      badgeNumber: "",
      rfc: "",
      curp: "",
      photoUrl: "",
      canAssess: false,
    }),
    [],
  );

  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: isEdit ? sanitizeInitial(initial) : newDefaults,
    mode: "onTouched",
  });

  React.useEffect(() => {
    if (isEdit && initial) {
      form.reset(sanitizeInitial(initial), { keepDefaultValues: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, initial, sanitizeInitial]);

  const [loading, setLoading] = React.useState(false);
  const disabled = !canEdit || loading;

  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (loading) return;
    setLoading(true);
    try {
      const safePayload = {
        ...values,
        rolesAllowed: values.canAssess ? [] : (values.rolesAllowed ?? []),
      };

      const action = isEdit ? updateRefereeAction : createRefereeAction;
      const payload = isEdit ? { ...safePayload, id: initial.id } : safePayload;

      const res = await action(payload);
      if (res?.ok === false) {
        // aquí podrías disparar un toast
        return;
      }

      router.push("/dashboard/referees");
    } finally {
      setLoading(false);
    }
  };

  const isAssessor = form.watch("canAssess");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Nombre */}
          <FormField
            name="name"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Categoría */}
          <FormField
            name="category"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoría</FormLabel>
                <FormControl>
                  <SegmentedField
                    value={field.value}
                    onChange={field.onChange}
                    options={RefCategoryZ.options}
                    disabled={disabled}
                    aria-label="Seleccionar categoría"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Estado */}
          <FormField
            name="status"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <FormControl>
                  <SegmentedField
                    value={field.value}
                    onChange={field.onChange}
                    options={RefStatusZ.options}
                    disabled={disabled}
                    aria-label="Seleccionar estado"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Modo de rol */}
          <FormField
            name="canAssess"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modo de rol</FormLabel>
                <FormControl>
                  <SegmentedField
                    value={field.value ? ("ASESOR" as const) : ("ARBITRO" as const)}
                    onChange={(v) => {
                      const hadRoles = (form.getValues("rolesAllowed") ?? []).length > 0;
                      if (v === "ASESOR" && hadRoles) {
                        const ok = window.confirm("Al pasar a Asesor se limpiarán los roles permitidos. ¿Continuar?");
                        if (!ok) return;
                        form.setValue("rolesAllowed", [], { shouldDirty: true, shouldValidate: true });
                      }
                      field.onChange(v === "ASESOR");
                    }}
                    options={["ARBITRO", "ASESOR"] as const}
                    disabled={disabled}
                    aria-label="Seleccionar modo de rol"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Roles permitidos */}
          <FormField
            name="rolesAllowed"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Roles permitidos</FormLabel>
                  {isAssessor && <Badge variant="secondary">Bloqueado por Asesor</Badge>}
                </div>
                <FormControl>
                  <RolesPills value={field.value ?? []} onChange={field.onChange} disabled={disabled || isAssessor} />
                </FormControl>
                <FormMessage />
                {isAssessor && (
                  <p className="text-muted-foreground text-xs">
                    Como Asesor, los roles de partido están deshabilitados.
                  </p>
                )}
              </FormItem>
            )}
          />

          {/* Zonas */}
          <FormField
            name="zones"
            control={form.control}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Zonas</FormLabel>
                <FormControl>
                  <ZonesMultiCombobox
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={disabled}
                    placeholder="Buscar y seleccionar zonas..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email */}
          <FormField
            name="email"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Teléfono */}
          <FormField
            name="phone"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* NUI */}
          <FormField
            name="badgeNumber"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>NUI</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* RFC */}
          <FormField
            name="rfc"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>RFC</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CURP */}
          <FormField
            name="curp"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>CURP</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Foto (URL) */}
          <FormField
            name="photoUrl"
            control={form.control}
            render={({ field }) => {
              const url = (field.value ?? "").trim();
              const showPreview = !!url && /^https?:\/\//i.test(url);

              return (
                <FormItem className="space-y-2 md:col-span-2">
                  <FormLabel>Foto (URL)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://mi-cdn.com/imagenes/arbitro123.jpg"
                      {...field}
                      disabled={disabled}
                      inputMode="url"
                      autoComplete="off"
                    />
                  </FormControl>
                  <p className="text-muted-foreground text-xs">
                    Pega la URL directa de la imagen (por ejemplo de Cloudinary, Imgur o tu CDN).
                  </p>
                  {showPreview ? (
                    <div className="rounded-lg border p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Previsualización de la foto del árbitro"
                        className="h-40 w-40 rounded object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : null}
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/referees")} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={disabled}>
            {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Registrar árbitro"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
