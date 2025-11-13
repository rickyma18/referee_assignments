"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { RefStatusCell } from "./referee-status-cell";

const STATUS_ALL = ["", "DISPONIBLE", "DUDOSO", "LESIONADO"] as const;

export function RefereesClient({
  initialItems,
  setStatusAction,
  deleteAction,
}: {
  initialItems: any[];
  setStatusAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  // 🔁 Sincroniza con props del servidor
  const [data, setData] = React.useState<any[]>(initialItems ?? []);
  React.useEffect(() => {
    setData(initialItems ?? []);
  }, [initialItems]);

  const router = useRouter();
  const params = useSearchParams();

  // 📌 Lee valores desde la URL
  const qParam = params.get("q") ?? "";
  const statusParam = (params.get("status") ?? "") as (typeof STATUS_ALL)[number];

  const pushWith = React.useCallback(
    (q: string, status: string) => {
      const base = "/dashboard/referees";
      const sp = new URLSearchParams(Array.from(params.entries()));

      // Actualizamos solo q y status, respetando otros params (como limit)
      if (q) sp.set("q", q);
      else sp.delete("q");

      if (status) sp.set("status", status);
      else sp.delete("status");

      const qs = sp.toString();
      router.push(qs ? `${base}?${qs}` : base);
    },
    [router, params],
  );

  // 👉 Botón "Cargar más": empuja un limit grande en la URL
  const handleLoadAll = React.useCallback(() => {
    const base = "/dashboard/referees";
    const sp = new URLSearchParams(Array.from(params.entries()));

    // Ajusta este número al límite real que uses
    sp.set("limit", "500");

    const qs = sp.toString();
    router.push(qs ? `${base}?${qs}` : base);
  }, [params, router]);

  // 🧠 Columnas (memo para rendimiento)
  const columns: ColumnDef<any>[] = React.useMemo(
    () => [
      {
        header: "Nombre",
        accessorKey: "name",
        cell: ({ row }) => {
          const n: string = row.original.name ?? "";
          const initials = n
            .split(" ")
            .map((p: string) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

          const photoUrl: string | undefined =
            row.original.photoUrl && row.original.photoUrl.trim() !== "" ? row.original.photoUrl : undefined;

          return (
            <Link href={`/dashboard/referees/${row.original.id}`} className="flex items-center gap-2 hover:underline">
              <Avatar className="h-8 w-8">
                <AvatarImage src={photoUrl} alt={n || "Árbitro"} />
                <AvatarFallback>{initials || "AR"}</AvatarFallback>
              </Avatar>
              <span>{n || "Sin nombre"}</span>
            </Link>
          );
        },
      },
      {
        header: "Zonas",
        accessorKey: "zones",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.zones ?? []).map((z: string) => (
              <Badge key={z} variant="secondary">
                {z}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        header: "Roles",
        accessorKey: "rolesAllowed",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.rolesAllowed ?? []).map((r: string) => (
              <Badge key={r} variant="outline">
                {r}
              </Badge>
            ))}
          </div>
        ),
      },
      { header: "Categoría", accessorKey: "category" },
      {
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => {
          const st: string = row.original.status ?? "";
          const dot =
            st === "DISPONIBLE"
              ? "bg-emerald-500"
              : st === "DUDOSO"
                ? "bg-amber-500"
                : st === "LESIONADO"
                  ? "bg-rose-500"
                  : "bg-muted";
          return (
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${dot}`} />
              <RefStatusCell id={row.original.id} status={row.original.status} setStatusAction={setStatusAction} />
            </div>
          );
        },
      },
      {
        header: () => <div className="pr-2 text-right">Acciones</div>,
        id: "actions",
        cell: ({ row }) => <ActionsCell row={row} deleteAction={deleteAction} />,
      },
    ],
    [deleteAction, setStatusAction],
  );

  // ➗ Partición: árbitros vs asesores
  const refs = React.useMemo(() => {
    const all = data ?? [];
    return {
      asesores: all.filter((x: any) => x.canAssess === true),
      arbitros: all.filter((x: any) => !x.canAssess),
    };
  }, [data]);

  // 🧮 Tablas separadas
  const tableArbitros = useReactTable({ data: refs.arbitros, columns, getCoreRowModel: getCoreRowModel() });
  const tableAsesores = useReactTable({ data: refs.asesores, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Árbitros</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-9">
            <Link href="/dashboard/referees/import">Importar Excel</Link>
          </Button>
          <Button asChild className="h-9">
            <Link href="/dashboard/referees/new">Nuevo árbitro</Link>
          </Button>
        </div>
      </div>

      {/* Filtros (sticky) */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 backdrop-blur">
        <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <DebouncedSearch defaultValue={qParam} onSearch={(q) => pushWith(q, statusParam)} />

          <Tabs
            value={statusParam}
            onValueChange={(val) => {
              pushWith(qParam, val);
            }}
            className="w-full md:w-auto"
          >
            <TabsList className="grid w-full grid-cols-4 md:inline-flex md:w-auto">
              <TabsTrigger value="">Todos</TabsTrigger>
              <TabsTrigger value="DISPONIBLE">Disponible</TabsTrigger>
              <TabsTrigger value="DUDOSO">Dudoso</TabsTrigger>
              <TabsTrigger value="LESIONADO">Lesionado</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Separator />
      </div>

      {/* Sección: Árbitros */}
      <SectionHeader title={`Árbitros (${refs.arbitros.length})`} subtitle="Plantilla operativa" />
      <div className="overflow-hidden rounded-md border">
        <DataTable table={tableArbitros} columns={columns} />
      </div>

      <div className="flex justify-center py-4">
        <Button variant="outline" onClick={handleLoadAll}>
          Cargar más
        </Button>
      </div>

      <Separator />

      {/* Sección: Asesores */}
      <SectionHeader
        title={`Asesores (${refs.asesores.length})`}
        subtitle="Evaluación y mentoría"
        right={
          <Button asChild variant="secondary" className="h-9">
            <Link href="/dashboard/referees/new?canAssess=1">Nuevo asesor</Link>
          </Button>
        }
      />
      <div className="overflow-hidden rounded-md border">
        <DataTable table={tableAsesores} columns={columns} />
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Search input con debounce y sincronización con cambios del prop */
function DebouncedSearch({
  defaultValue,
  onSearch,
  delay = 400,
}: {
  defaultValue?: string;
  onSearch: (q: string) => void;
  delay?: number;
}) {
  const [val, setVal] = React.useState(defaultValue ?? "");

  // 🔁 Si cambia el valor en la URL, refleja el cambio en el input
  React.useEffect(() => {
    setVal(defaultValue ?? "");
  }, [defaultValue]);

  const lastSentRef = React.useRef<string>(defaultValue ?? "");

  React.useEffect(() => {
    // ⛔ No dispares nada si el valor es igual al que viene de la URL
    if (val === defaultValue) return;

    const t = setTimeout(() => {
      const trimmed = val.trim();
      // evita repetir la misma búsqueda una y otra vez
      if (trimmed !== lastSentRef.current) {
        lastSentRef.current = trimmed;
        onSearch(trimmed);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [val, delay, onSearch, defaultValue]);

  return (
    <div className="relative w-full md:w-80">
      <Input placeholder="Buscar por nombre…" value={val} onChange={(e) => setVal(e.target.value)} className="pr-8" />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
        ↵
      </span>
    </div>
  );
}

function ActionsCell({ row, deleteAction }: { row: any; deleteAction: (formData: FormData) => Promise<void> }) {
  const id = row.original.id as string;

  return (
    <div className="flex w-full justify-end gap-1 pr-2">
      {/* Botón editar */}
      <Button asChild size="sm" variant="outline" className="h-8">
        <Link href={`/dashboard/referees/${id}/edit`}>
          <Pencil className="mr-1 h-4 w-4" /> Editar
        </Link>
      </Button>

      {/* Diálogo estándar shadcn */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-8"
            onClick={(e) => {
              e.stopPropagation(); // evita que la fila haga cosas raras
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Eliminar
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar árbitro?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction type="submit">Sí, eliminar</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
