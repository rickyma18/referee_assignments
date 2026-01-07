import { createStore } from "zustand/vanilla";

import type { UserRole } from "@/types/roles";

const STORAGE_KEY = "activeDelegateId";

export type DelegateState = {
  role: UserRole | null;
  userDelegateId: string | null; // delegateId del usuario actual (fijo para DELEGADO)
  activeDelegateId: string | null; // delegado activo (seleccionable para SUPERUSUARIO/ARBITRO)
  allowedDelegateIds: string[]; // lista de delegateIds permitidos (para ARBITRO/ASISTENTE)
  setActiveDelegateId: (id: string | null) => void;
  canSwitchDelegate: boolean; // indica si puede cambiar de delegado
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
  // Para ARBITRO/ASISTENTE: puede ser cualquiera de allowedDelegateIds
  const role = init?.role ?? null;
  const userDelegateId = init?.userDelegateId ?? null;
  const allowedDelegateIds = init?.allowedDelegateIds ?? [];

  // Determinar si puede cambiar de delegado
  const canSwitchDelegate =
    role === "SUPERUSUARIO" || ((role === "ARBITRO" || role === "ASISTENTE") && allowedDelegateIds.length > 1);

  // Determinar activeDelegateId inicial
  let initialActiveDelegateId: string | null = null;

  if (role === "DELEGADO") {
    // Forzar a su propio delegateId
    initialActiveDelegateId = userDelegateId;
  } else if (role === "SUPERUSUARIO") {
    // Intentar recuperar de localStorage o usar el proporcionado
    initialActiveDelegateId = init?.activeDelegateId ?? getStoredActiveDelegateId();
  } else if (role === "ARBITRO" || role === "ASISTENTE") {
    // Usar el proporcionado o el primero de allowedDelegateIds o userDelegateId
    initialActiveDelegateId = init?.activeDelegateId ?? allowedDelegateIds[0] ?? userDelegateId;
  }

  return createStore<DelegateState>()((set, get) => ({
    role,
    userDelegateId,
    activeDelegateId: initialActiveDelegateId,
    allowedDelegateIds,
    canSwitchDelegate,
    setActiveDelegateId: (id: string | null) => {
      const currentRole = get().role;
      const allowed = get().allowedDelegateIds;

      // SUPERUSUARIO puede cambiar a cualquier delegado
      if (currentRole === "SUPERUSUARIO") {
        persistActiveDelegateId(id);
        set({ activeDelegateId: id });
        return;
      }

      // ARBITRO/ASISTENTE solo pueden cambiar a delegados permitidos
      if ((currentRole === "ARBITRO" || currentRole === "ASISTENTE") && id && allowed.includes(id)) {
        persistActiveDelegateId(id);
        set({ activeDelegateId: id });
        return;
      }

      console.warn("No tienes permiso para cambiar a este delegado");
    },
  }));
};
