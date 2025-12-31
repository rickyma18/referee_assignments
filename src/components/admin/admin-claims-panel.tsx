"use client";

import { useState, useTransition } from "react";

import { AlertCircle, Check, Loader2, Search, Trash2, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  clearUserClaimsAction,
  findUserAction,
  setUserClaimsAction,
  setUserDelegateIdClaimAction,
  setUserRoleClaimAction,
  type UserClaimsData,
} from "@/server/actions/admin-claims.actions";

const VALID_ROLES = ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"] as const;

type Status = "idle" | "loading" | "success" | "error";

/**
 * AdminClaimsPanel - Panel para administrar Custom Claims de usuarios
 *
 * Solo visible para SUPERUSUARIO en /dashboard/default
 * Permite buscar usuarios y modificar sus claims (role, delegateId)
 */
export function AdminClaimsPanel() {
  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [searchStatus, setSearchStatus] = useState<Status>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [userData, setUserData] = useState<UserClaimsData | null>(null);

  // Form state
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [delegateIdInput, setDelegateIdInput] = useState("");

  // Action state
  const [isPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search for user
  const handleSearch = async () => {
    if (!searchInput.trim()) {
      setSearchMessage("Ingresa un UID o email");
      setSearchStatus("error");
      return;
    }

    setSearchStatus("loading");
    setSearchMessage("");
    setActionMessage(null);

    const result = await findUserAction(searchInput.trim());

    if (result.ok) {
      const data = result.data as UserClaimsData;
      setUserData(data);
      setSearchStatus("success");
      // Pre-fill form with current values
      setSelectedRole((data.customClaims.role as string) ?? data.userDoc.role ?? "");
      setDelegateIdInput((data.customClaims.delegateId as string) ?? data.userDoc.delegateId ?? "");
    } else {
      setUserData(null);
      setSearchStatus("error");
      setSearchMessage(result.message);
    }
  };

  // Refresh user data after action
  const refreshUserData = async () => {
    if (!userData) return;
    const result = await findUserAction(userData.uid);
    if (result.ok) {
      setUserData(result.data as UserClaimsData);
    }
  };

  // Set only role
  const handleSetRole = () => {
    if (!userData || !selectedRole) return;
    startTransition(async () => {
      const result = await setUserRoleClaimAction({ uid: userData.uid, role: selectedRole });
      if (result.ok) {
        setActionMessage({ type: "success", text: "Role actualizado correctamente" });
        await refreshUserData();
      } else {
        setActionMessage({ type: "error", text: result.message });
      }
    });
  };

  // Set only delegateId
  const handleSetDelegateId = () => {
    if (!userData || !delegateIdInput.trim()) return;
    startTransition(async () => {
      const result = await setUserDelegateIdClaimAction({
        uid: userData.uid,
        delegateId: delegateIdInput.trim(),
      });
      if (result.ok) {
        setActionMessage({ type: "success", text: "DelegateId actualizado correctamente" });
        await refreshUserData();
      } else {
        setActionMessage({ type: "error", text: result.message });
      }
    });
  };

  // Set both role and delegateId
  const handleSetBoth = () => {
    if (!userData || !selectedRole) return;
    startTransition(async () => {
      const result = await setUserClaimsAction({
        uid: userData.uid,
        role: selectedRole,
        delegateId: delegateIdInput.trim() || null,
      });
      if (result.ok) {
        setActionMessage({ type: "success", text: "Claims actualizados correctamente" });
        await refreshUserData();
      } else {
        setActionMessage({ type: "error", text: result.message });
      }
    });
  };

  // Clear all claims
  const handleClearClaims = () => {
    if (!userData) return;
    startTransition(async () => {
      const result = await clearUserClaimsAction(userData.uid);
      if (result.ok) {
        setActionMessage({ type: "success", text: "Claims limpiados correctamente" });
        await refreshUserData();
        setSelectedRole("");
        setDelegateIdInput("");
      } else {
        setActionMessage({ type: "error", text: result.message });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="space-y-3">
        <Label htmlFor="search-input">Buscar usuario</Label>
        <div className="flex gap-2">
          <Input
            id="search-input"
            placeholder="UID o email del usuario"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={searchStatus === "loading"}>
            {searchStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="sr-only ml-2 sm:not-sr-only">Buscar</span>
          </Button>
        </div>
        {searchStatus === "error" && searchMessage && (
          <p className="text-destructive flex items-center gap-1 text-sm">
            <AlertCircle className="h-4 w-4" />
            {searchMessage}
          </p>
        )}
      </div>

      {/* User Info Section */}
      {userData && (
        <>
          <Separator />

          <div className="space-y-4">
            {/* User Basic Info */}
            <div className="flex items-start gap-3">
              <div className="bg-muted rounded-full p-2">
                <User className="text-muted-foreground h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">{userData.displayName ?? "Sin nombre"}</p>
                <p className="text-muted-foreground truncate text-sm">{userData.email ?? "Sin email"}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">UID: {userData.uid}</p>
              </div>
            </div>

            {/* Current Claims */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase">Claims actuales</Label>
              <div className="flex flex-wrap gap-2">
                {userData.customClaims.role ? (
                  <Badge variant="default">role: {String(userData.customClaims.role)}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    role: (no set)
                  </Badge>
                )}
                {userData.customClaims.delegateId ? (
                  <Badge variant="secondary">delegateId: {String(userData.customClaims.delegateId)}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    delegateId: (no set)
                  </Badge>
                )}
              </div>
            </div>

            {/* UserDoc Fallback Info */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase">UserDoc (fallback)</Label>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">role: {userData.userDoc.role ?? "(null)"}</Badge>
                <Badge variant="outline">delegateId: {userData.userDoc.delegateId ?? "(null)"}</Badge>
              </div>
            </div>

            <Separator />

            {/* Edit Section */}
            <div className="space-y-4">
              <Label className="text-muted-foreground text-xs uppercase">Modificar claims</Label>

              {/* Role Select */}
              <div className="space-y-2">
                <Label htmlFor="role-select">Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger id="role-select" className="w-full">
                    <SelectValue placeholder="Seleccionar role" />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* DelegateId Input */}
              <div className="space-y-2">
                <Label htmlFor="delegate-input">DelegateId</Label>
                <Input
                  id="delegate-input"
                  placeholder="del_xxxxx"
                  value={delegateIdInput}
                  onChange={(e) => setDelegateIdInput(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">Normalmente igual al UID. Dejar vacío para quitar.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleSetRole} disabled={isPending || !selectedRole}>
                  {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Set Role
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSetDelegateId}
                  disabled={isPending || !delegateIdInput.trim()}
                >
                  {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Set DelegateId
                </Button>
                <Button size="sm" onClick={handleSetBoth} disabled={isPending || !selectedRole}>
                  {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Set Both
                </Button>
                <Button size="sm" variant="destructive" onClick={handleClearClaims} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                  Clear Claims
                </Button>
              </div>

              {/* Action Message */}
              {actionMessage && (
                <p
                  className={`flex items-center gap-1 text-sm ${
                    actionMessage.type === "success" ? "text-green-600" : "text-destructive"
                  }`}
                >
                  {actionMessage.type === "success" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {actionMessage.text}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
