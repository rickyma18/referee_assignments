"use client";

import { useEffect, useState, useTransition } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
import { type DelegateInfo, listDelegatesAction, listDelegatesByIdsAction } from "@/server/actions/delegates.actions";

/**
 * DelegateSwitcher - Selector de delegado activo
 *
 * Visible para SUPERUSUARIO, ARBITRO y ASISTENTE (si tienen más de 1 delegación permitida).
 * Usa query param ?delegateId=... como fuente de verdad (shareable URLs).
 */
export function DelegateSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role, activeDelegateId, setActiveDelegateId, allowedDelegateIds, canSwitchDelegate } = useDelegateContext();
  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isSuper = role === "SUPERUSUARIO";

  // No mostrar si no puede cambiar de delegado
  if (!canSwitchDelegate) {
    return null;
  }

  // Cargar delegados al abrir el dropdown
  const handleOpenChange = async (open: boolean) => {
    if (open && delegates.length === 0) {
      setIsLoading(true);
      try {
        if (isSuper) {
          // SUPERUSUARIO: cargar todos los delegados
          const result = await listDelegatesAction();
          setDelegates(result);
        } else {
          // ARBITRO/ASISTENTE: cargar solo los permitidos
          const result = await listDelegatesByIdsAction(allowedDelegateIds);
          setDelegates(result);
        }
      } catch (error) {
        console.error("Error loading delegates:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Seleccionar delegado usando query param
  const handleSelectDelegate = (delegateId: string | null) => {
    // 1. Guardar en store para client components
    setActiveDelegateId(delegateId);

    // 2. Actualizar URL con query param
    const params = new URLSearchParams(searchParams.toString());
    if (delegateId) {
      params.set("delegateId", delegateId);
    } else {
      params.delete("delegateId");
    }

    // 3. Navegar con el nuevo query param
    startTransition(() => {
      const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.push(newUrl);
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

        {/* Opción Modo Global - solo para SUPERUSUARIO */}
        {isSuper && (
          <>
            <DropdownMenuItem onClick={() => handleSelectDelegate(null)} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Modo global
              </span>
              {!activeDelegateId && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Lista de delegados */}
        {isLoading ? (
          <DropdownMenuItem disabled className="flex items-center justify-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando delegados...
          </DropdownMenuItem>
        ) : delegates.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No hay delegados disponibles
          </DropdownMenuItem>
        ) : (
          delegates.map((delegate) => (
            <DropdownMenuItem
              key={delegate.uid ?? delegate.delegateId}
              onClick={() => handleSelectDelegate(delegate.delegateId)}
              className="flex items-center justify-between"
            >
              <span className="flex flex-col">
                <span className="truncate">{delegate.displayName ?? delegate.email ?? delegate.delegateId}</span>
                {delegate.displayName && delegate.email && (
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
