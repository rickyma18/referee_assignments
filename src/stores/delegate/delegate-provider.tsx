"use client";

import { createContext, useContext, useState, useEffect } from "react";

import { useStore, type StoreApi } from "zustand";

import { useCurrentUser } from "@/hooks/use-current-user";

import { createDelegateStore, DelegateState } from "./delegate-store";

const DelegateStoreContext = createContext<StoreApi<DelegateState> | null>(null);

export const DelegateStoreProvider = ({ children }: { children: React.ReactNode }) => {
  const { userDoc, loading } = useCurrentUser();

  // Crear store solo una vez con useState lazy initializer (evita leer refs durante render)
  const [store] = useState(() =>
    createDelegateStore({
      role: null,
      userDelegateId: null,
      activeDelegateId: null,
    }),
  );

  // Actualizar store cuando userDoc cambie
  useEffect(() => {
    if (loading) return;

    const state = store.getState();
    const newRole = userDoc?.role ?? null;
    const newUserDelegateId = userDoc?.delegateId ?? null;
    const newAllowedDelegateIds = userDoc?.allowedDelegateIds ?? [];

    // Calcular canSwitchDelegate
    const newCanSwitchDelegate =
      newRole === "SUPERUSUARIO" ||
      ((newRole === "ARBITRO" || newRole === "ASISTENTE") && newAllowedDelegateIds.length > 1);

    // Solo actualizar si hay cambios
    if (
      state.role !== newRole ||
      state.userDelegateId !== newUserDelegateId ||
      JSON.stringify(state.allowedDelegateIds) !== JSON.stringify(newAllowedDelegateIds)
    ) {
      // Determinar activeDelegateId según rol
      let newActiveDelegateId: string | null;
      if (newRole === "DELEGADO") {
        // Forzar a su propio delegateId
        newActiveDelegateId = newUserDelegateId;
      } else if (newRole === "ARBITRO" || newRole === "ASISTENTE") {
        // Usar el actual si está en allowed, sino el primero de la lista o userDelegateId
        if (state.activeDelegateId && newAllowedDelegateIds.includes(state.activeDelegateId)) {
          newActiveDelegateId = state.activeDelegateId;
        } else {
          newActiveDelegateId = newAllowedDelegateIds[0] ?? newUserDelegateId;
        }
      } else {
        // SUPERUSUARIO: mantener el actual
        newActiveDelegateId = state.activeDelegateId;
      }

      store.setState({
        role: newRole,
        userDelegateId: newUserDelegateId,
        activeDelegateId: newActiveDelegateId,
        allowedDelegateIds: newAllowedDelegateIds,
        canSwitchDelegate: newCanSwitchDelegate,
      });
    }
  }, [userDoc, loading, store]);

  return <DelegateStoreContext.Provider value={store}>{children}</DelegateStoreContext.Provider>;
};

export const useDelegateStore = <T,>(selector: (state: DelegateState) => T): T => {
  const store = useContext(DelegateStoreContext);
  if (!store) throw new Error("Missing DelegateStoreProvider");
  return useStore(store, selector);
};

/**
 * Hook para acceder al contexto de delegado
 * Expone: role, userDelegateId, activeDelegateId, allowedDelegateIds, setActiveDelegateId, canSwitchDelegate
 */
export const useDelegateContext = () => {
  const role = useDelegateStore((s) => s.role);
  const userDelegateId = useDelegateStore((s) => s.userDelegateId);
  const activeDelegateId = useDelegateStore((s) => s.activeDelegateId);
  const allowedDelegateIds = useDelegateStore((s) => s.allowedDelegateIds);
  const setActiveDelegateId = useDelegateStore((s) => s.setActiveDelegateId);
  const canSwitchDelegate = useDelegateStore((s) => s.canSwitchDelegate);

  return {
    role,
    userDelegateId,
    activeDelegateId,
    allowedDelegateIds,
    setActiveDelegateId,
    // Helper: obtiene el delegateId efectivo para queries
    effectiveDelegateId: activeDelegateId ?? userDelegateId,
    // Helper: indica si el usuario puede cambiar de delegado
    canSwitchDelegate,
  };
};
