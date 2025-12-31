"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Check, Globe, Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDelegateContext } from "@/context/delegate-context";
import { setActiveDelegateCookie } from "@/server/actions/delegate-cookie.actions";
import { type DelegateInfo, listDelegatesAction } from "@/server/actions/delegates.actions";

/**
 * DelegateSwitcher - Selector de delegado activo
 *
 * Visible SOLO para SUPERUSUARIO.
 * Permite seleccionar qué delegado "impersonar" para ver sus datos.
 */
export function DelegateSwitcher() {
  const router = useRouter();
  const { role, activeDelegateId, setActiveDelegateId } = useDelegateContext();
  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Solo visible para SUPERUSUARIO
  if (role !== "SUPERUSUARIO") {
    return null;
  }

  // Cargar delegados al abrir el dropdown
  const handleOpenChange = async (open: boolean) => {
    if (open && delegates.length === 0) {
      setIsLoading(true);
      try {
        const result = await listDelegatesAction();
        setDelegates(result);
      } catch (error) {
        console.error("Error loading delegates:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Seleccionar delegado
  const handleSelectDelegate = async (delegateId: string | null) => {
    // 1. Guardar en cookie para server components
    await setActiveDelegateCookie(delegateId);
    // 2. Guardar en store para client components
    setActiveDelegateId(delegateId);
    // 3. Refrescar la ruta para que server components re-rendericen
    startTransition(() => {
      router.refresh();
    });
  };

  // Encontrar nombre del delegado activo
  const activeDelegate = delegates.find((d) => d.delegateId === activeDelegateId);
  const activeLabel = activeDelegateId
    ? (activeDelegate?.displayName ?? activeDelegate?.email ?? `ID: ${activeDelegateId}`)
    : "Global";

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant={activeDelegateId ? "default" : "outline"} size="sm" className="gap-2" title="Delegado activo">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : activeDelegateId ? (
            <Users className="h-4 w-4" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          <span className="max-w-[120px] truncate">{activeLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Delegado activo</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Opción Modo Global */}
        <DropdownMenuItem onClick={() => handleSelectDelegate(null)} className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Modo global
          </span>
          {!activeDelegateId && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Lista de delegados */}
        {isLoading ? (
          <DropdownMenuItem disabled className="flex items-center justify-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando delegados...
          </DropdownMenuItem>
        ) : delegates.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No hay delegados registrados
          </DropdownMenuItem>
        ) : (
          delegates.map((delegate) => (
            <DropdownMenuItem
              key={delegate.uid}
              onClick={() => handleSelectDelegate(delegate.delegateId)}
              className="flex items-center justify-between"
            >
              <span className="flex flex-col">
                <span className="truncate">{delegate.displayName ?? delegate.email}</span>
                {delegate.displayName && (
                  <span className="text-muted-foreground truncate text-xs">{delegate.email}</span>
                )}
              </span>
              {activeDelegateId === delegate.delegateId && <Check className="h-4 w-4 flex-shrink-0" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
