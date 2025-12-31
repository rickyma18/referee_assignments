// src/hooks/use-active-delegate-param.ts
import { useDelegateContext } from "@/context/delegate-context";

/**
 * Hook para extraer el activeDelegateId del contexto cliente
 * y prepararlo para pasarlo a server actions.
 *
 * Solo SUPERUSUARIO necesita pasar este parámetro.
 * Los DELEGADO siempre usan su propio delegateId (fijo en servidor).
 *
 * @example
 * const params = useActiveDelegateParam();
 * // Para SUPER: { activeDelegateId: "xyz" } o { activeDelegateId: null }
 * // Para otros: {}
 *
 * await someServerAction({ ...input, ...params });
 */
export function useActiveDelegateParam() {
  const { canSwitchDelegate, activeDelegateId } = useDelegateContext();

  // Solo SUPERUSUARIO (canSwitchDelegate) necesita pasar el param
  return canSwitchDelegate ? { activeDelegateId } : {};
}
