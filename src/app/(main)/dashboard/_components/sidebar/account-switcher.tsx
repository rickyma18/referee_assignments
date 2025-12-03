"use client";

import { useRouter } from "next/navigation";

import { signOut } from "firebase/auth";
import { BadgeCheck, LogOut, User2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { auth } from "@/lib/firebase";
import { cn, getInitials } from "@/lib/utils";
import { clearSessionAction } from "@/server/auth/auth.actions"; // 👈 limpiamos cookie del server

export function AccountSwitcher() {
  const router = useRouter();
  const { firebaseUser, userDoc, loading } = useCurrentUser();

  const name = userDoc?.displayName ?? firebaseUser?.displayName ?? userDoc?.email ?? "Usuario";
  const email = firebaseUser?.email ?? userDoc?.email ?? "";
  const avatar: string | undefined = firebaseUser?.photoURL ?? undefined;
  const role = userDoc?.role ?? "—";

  const handleLogout = async () => {
    try {
      // 1) Cerrar sesión en el cliente (Firebase JS SDK)
      await signOut(auth);

      // 2) Limpiar cookie httpOnly (__session) en el SERVER
      await clearSessionAction();

      // 3) Enviar al login
      router.replace("/auth/login");
    } catch (err) {
      // aquí podrías meter un toast si quieres
      // toast.error("No se pudo cerrar sesión.");
      console.error("Error al cerrar sesión:", err);
    }
  };

  if (loading) {
    return <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" aria-label="Cargando usuario…" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-9 cursor-pointer rounded-lg">
          <AvatarImage src={avatar} alt={name} />
          <AvatarFallback className="rounded-lg">{getInitials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="min-w-56 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="size-9 rounded-lg">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback className="rounded-lg">{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-muted-foreground truncate text-xs">{email}</p>
            <p className="truncate text-xs capitalize">{role}</p>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/dashboard/account")} className={cn("cursor-pointer")}>
            <BadgeCheck className="mr-2 size-4" />
            Cuenta
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="mr-2 size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
