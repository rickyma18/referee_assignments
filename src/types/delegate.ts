// src/types/delegate.ts

/**
 * Documento de delegación en Firestore.
 * Colección: /delegates/{delegateId}
 */
export interface DelegateDoc {
  /** ID del documento (ej: "del_jalisco") */
  id: string;
  /** Nombre para mostrar en UI */
  name: string;
  /** Si está activa (default: true si no existe) */
  isActive?: boolean;
  /** Orden para mostrar (menor = primero) */
  order?: number;
}

/**
 * Opción para Select de delegaciones
 */
export interface DelegateOption {
  value: string; // doc.id
  label: string; // name o doc.id como fallback
}
