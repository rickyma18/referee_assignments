"use client";

import * as React from "react";

import Image from "next/image";
import Link from "next/link";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";

type LeagueRow = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
};

function CircleLogo({
  src,
  alt,
  size = 32,
  initials,
  ringColor,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  initials: string;
  ringColor?: string | null;
}) {
  const dim = size;
  const ringStyle =
    ringColor && /^#|rgb|hsl|var\(/.test(ringColor) ? { boxShadow: `inset 0 0 0 2px ${ringColor}44` } : undefined;

  if (src) {
    return (
      <div className="relative overflow-hidden rounded-full border" style={{ width: dim, height: dim, ...ringStyle }}>
        <Image src={src} alt={alt} fill className="object-cover" sizes={`${dim}px`} />
      </div>
    );
  }
  return (
    <div
      className="bg-muted text-muted-foreground flex items-center justify-center rounded-full border"
      style={{ width: dim, height: dim, fontSize: Math.max(10, Math.floor(dim * 0.42)), ...ringStyle }}
      aria-label={alt}
      title={alt}
    >
      {initials}
    </div>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const StatusBadge = ({ status }: { status?: LeagueRow["status"] }) =>
  status === "ARCHIVED" ? <Badge variant="secondary">Archivada</Badge> : <Badge variant="outline">Activa</Badge>;

export function LeaguesClient({
  initialItems,
  deleteAction,
}: {
  initialItems: LeagueRow[];
  deleteAction: (formData: FormData) => Promise<void>; // server action inyectada por la page
}) {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  // Si quieres revalidar tras borrar, recargas con router.refresh() (opcional)
  const [items, setItems] = React.useState(initialItems);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ligas</h1>
          <p className="text-muted-foreground text-sm">Administra las ligas, temporadas y accesos.</p>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href="/dashboard/leagues/new">Nueva liga</Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="p-2 sm:p-3">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="bg-muted/60 sticky left-0 z-10 p-3 text-left">Liga</th>
                  <th className="p-3 text-left">Temporada</th>
                  <th className="p-3 text-left">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <div className="text-lg font-medium">Aún no hay ligas</div>
                        <p className="text-muted-foreground text-sm">Crea tu primera liga…</p>
                        {canEdit && (
                          <Button asChild size="sm" className="mt-1">
                            <Link href="/dashboard/leagues/new">Crear liga</Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((l) => {
                    const initials = initialsOf(l.name || "Liga");
                    return (
                      <tr key={l.id} className="hover:bg-muted/30 focus-within:bg-muted/30 border-t transition-colors">
                        <td className="bg-background sticky left-0 z-10 p-3">
                          <Link
                            href={`/dashboard/leagues/${l.id}`}
                            className="group inline-flex items-center gap-3"
                            aria-label={`Abrir liga ${l.name}`}
                            title={`Abrir liga ${l.name}`}
                          >
                            <CircleLogo
                              src={l.logoUrl}
                              alt={`${l.name} logo`}
                              size={32}
                              initials={initials}
                              ringColor={l.color ?? null}
                            />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium underline-offset-4 group-hover:underline">
                                {l.name}
                              </span>
                              <span className="text-muted-foreground truncate text-xs">ID: {l.id}</span>
                            </div>
                          </Link>
                        </td>
                        <td className="p-3">{l.season}</td>
                        <td className="p-3">
                          <StatusBadge status={l.status ?? "ACTIVE"} />
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/dashboard/leagues/${l.id}`}>Grupos</Link>
                            </Button>

                            {canEdit && (
                              <>
                                <Button asChild size="sm" variant="secondary">
                                  <Link href={`/dashboard/leagues/${l.id}/edit`}>Editar</Link>
                                </Button>

                                {/* Eliminar via Server Action (form) */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="destructive" disabled={deletingId === l.id}>
                                      {deletingId === l.id ? "Eliminando…" : "Eliminar"}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Eliminar liga “{l.name}”?</AlertDialogTitle>
                                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <form
                                        action={async (formData) => {
                                          try {
                                            setDeletingId(l.id);
                                            await deleteAction(formData);
                                            toast.success("Liga eliminada correctamente");
                                            // Opcional: quitarla localmente
                                            setItems((prev) => prev.filter((x) => x.id !== l.id));
                                          } catch (e: any) {
                                            toast.error(e?.message ?? "No se pudo eliminar la liga");
                                          } finally {
                                            setDeletingId(null);
                                          }
                                        }}
                                      >
                                        <input type="hidden" name="id" value={l.id} />
                                        <AlertDialogAction className="bg-red-500 hover:bg-red-700" type="submit">
                                          Confirmar eliminación
                                        </AlertDialogAction>
                                      </form>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
