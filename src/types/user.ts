// src/types/user.ts
import type { UserRole } from "@/types/roles";

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole; // 'SUPERUSUARIO' | 'DELEGADO' | 'ASISTENTE' | 'ARBITRO'
  scope?: Record<string, any> | null; // para permisos/tenancy por liga/zona si aplica
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now()
}

export const DEFAULT_ROLE: UserRole = "ARBITRO";
