"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type EntityHeaderProps = {
  loading?: boolean;

  // Visual
  logoUrl?: string | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  colorHex?: string | null; // ej. "#1F8B4C"

  // Navegación
  backHref?: string;
  backText?: string;

  // Eliminar
  canDelete?: boolean;
  deleteLabel?: string; // texto del botón
  deleteConfirmTitle?: string;
  deleteConfirmDescription?: string;
  onDelete?: () => Promise<void> | void;

  // Acciones extra a la derecha (además de Volver / Eliminar)
  rightExtra?: React.ReactNode;
};

export function EntityHeader({
  loading = false,
  logoUrl = "/media/FMF_Logo.png", // 👈 default opcional
  title,
  subtitle,
  colorHex,
  backHref,
  backText = "Volver",
  canDelete = false,
  deleteLabel = "Eliminar",
  deleteConfirmTitle = "Confirmar eliminación",
  deleteConfirmDescription = "Esta acción no se puede deshacer.",
  onDelete,
  rightExtra,
}: EntityHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  if (loading) {
    return <EntityHeader.Skeleton />;
  }

  async function handleDelete() {
    if (!onDelete) return;
    try {
      setDeleting(true);
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        {/* Izquierda: logo + textos */}
        <div className="flex items-center gap-4">
          <div className="bg-muted flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="max-h-14 max-w-14 object-contain" referrerPolicy="no-referrer" />
            ) : (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center text-[10px]">
                Sin logo
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-xl leading-tight font-semibold">{title}</h1>
            {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
            {colorHex ? (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span
                  className="inline-block size-4 rounded border"
                  style={{ backgroundColor: colorHex || undefined }}
                />
                <span className="text-muted-foreground">Color:</span>
                <span className="font-mono">{colorHex}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Derecha: acciones */}
        <div className="flex flex-wrap items-center gap-2">
          {rightExtra}

          {backHref ? (
            <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
              {backText}
            </Button>
          ) : null}

          {canDelete && onDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                  {deleteLabel}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{deleteConfirmDescription}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Eliminando..." : deleteLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      <Separator />
    </>
  );
}

EntityHeader.Skeleton = function EntityHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <Separator />
    </div>
  );
};
