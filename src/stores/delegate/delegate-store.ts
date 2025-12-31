import { createStore } from "zustand/vanilla";

import type { UserRole } from "@/types/roles";

const STORAGE_KEY = "activeDelegateId";

export type DelegateState = {
  role: UserRole | null;
  userDelegateId: string | null; // delegateId del usuario actual (fijo para DELEGADO)
  activeDelegateId: string | null; // delegado activo (seleccionable solo para SUPERUSUARIO)
  setActiveDelegateId: (id: string | null) => void;
};

function getStoredActiveDelegateId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistActiveDelegateId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Silently fail if localStorage is not available
  }
}

export const createDelegateStore = (init?: Partial<DelegateState>) => {
  // Para DELEGADO: activeDelegateId siempre es su propio userDelegateId
  // Para SUPERUSUARIO: puede ser null o cualquier delegateId
  const role = init?.role ?? null;
  const userDelegateId = init?.userDelegateId ?? null;

  // Determinar activeDelegateId inicial
  let initialActiveDelegateId: string | null = null;

  if (role === "DELEGADO") {
    // Forzar a su propio delegateId
    initialActiveDelegateId = userDelegateId;
  } else if (role === "SUPERUSUARIO") {
    // Intentar recuperar de localStorage o usar el proporcionado
    initialActiveDelegateId = init?.activeDelegateId ?? getStoredActiveDelegateId();
  }

  return createStore<DelegateState>()((set, get) => ({
    role,
    userDelegateId,
    activeDelegateId: initialActiveDelegateId,
    setActiveDelegateId: (id: string | null) => {
      const currentRole = get().role;

      // Solo SUPERUSUARIO puede cambiar el delegado activo
      if (currentRole !== "SUPERUSUARIO") {
        console.warn("Solo SUPERUSUARIO puede cambiar el delegado activo");
        return;
      }

      persistActiveDelegateId(id);
      set({ activeDelegateId: id });
    },
  }));
};
