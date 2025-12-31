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

    // Solo actualizar si hay cambios
    if (state.role !== newRole || state.userDelegateId !== newUserDelegateId) {
      // Si es DELEGADO, forzar activeDelegateId a su propio delegateId
      const newActiveDelegateId = newRole === "DELEGADO" ? newUserDelegateId : state.activeDelegateId;

      store.setState({
        role: newRole,
        userDelegateId: newUserDelegateId,
        activeDelegateId: newActiveDelegateId,
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
 * Expone: role, userDelegateId, activeDelegateId, setActiveDelegateId
 */
export const useDelegateContext = () => {
  const role = useDelegateStore((s) => s.role);
  const userDelegateId = useDelegateStore((s) => s.userDelegateId);
  const activeDelegateId = useDelegateStore((s) => s.activeDelegateId);
  const setActiveDelegateId = useDelegateStore((s) => s.setActiveDelegateId);

  return {
    role,
    userDelegateId,
    activeDelegateId,
    setActiveDelegateId,
    // Helper: obtiene el delegateId efectivo para queries (Fase 2)
    effectiveDelegateId: activeDelegateId ?? userDelegateId,
    // Helper: indica si el usuario puede cambiar de delegado
    canSwitchDelegate: role === "SUPERUSUARIO",
  };
};
