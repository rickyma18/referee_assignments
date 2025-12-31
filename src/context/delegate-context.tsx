/**
 * Delegate Context - Multi-tenant por delegado
 *
 * Este contexto proporciona:
 * - role: El rol actual del usuario
 * - userDelegateId: El delegateId propio del usuario (para DELEGADO)
 * - activeDelegateId: El delegado activo (seleccionable por SUPERUSUARIO)
 * - setActiveDelegateId: Función para cambiar el delegado activo (solo SUPERUSUARIO)
 * - effectiveDelegateId: El delegateId que debe usarse para filtrar datos (Fase 2)
 * - canSwitchDelegate: Indica si el usuario puede cambiar de delegado
 *
 * Reglas:
 * - DELEGADO: activeDelegateId siempre es su propio userDelegateId (fijo)
 * - SUPERUSUARIO: puede seleccionar cualquier delegado, persistido en localStorage
 * - Otros roles: no tienen contexto de delegado
 */

export { DelegateStoreProvider, useDelegateContext, useDelegateStore } from "@/stores/delegate/delegate-provider";
export type { DelegateState } from "@/stores/delegate/delegate-store";
