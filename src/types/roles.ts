// src/types/roles.ts
export type UserRole = "SUPERUSUARIO" | "DELEGADO" | "ASISTENTE" | "ARBITRO";

export const ROLES: UserRole[] = ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"];

// Acciones del dominio (granulares y explícitas)
export type RbacAction =
  | "users.setRole"
  | "designaciones.view"
  | "designaciones.create"
  | "designaciones.update"
  | "designaciones.delete"
  | "designaciones.override"; // modificar lo del delegado
