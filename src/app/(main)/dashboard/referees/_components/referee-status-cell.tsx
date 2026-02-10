// src/app/(main)/dashboard/referees/_components/referee-status-cell.tsx
"use client";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { RefStatusBadge } from "./referee-status";

const STATUS: Array<"DISPONIBLE" | "LESIONADO" | "INACTIVO"> = ["DISPONIBLE", "LESIONADO", "INACTIVO"];

export function RefStatusCell({
  id,
  status,
  setStatusAction,
}: {
  id: string;
  status: "DISPONIBLE" | "LESIONADO" | "INACTIVO";
  setStatusAction: (formData: FormData) => Promise<void>;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(next: string) {
    if (pending) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", next);
      await setStatusAction(fd);
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <div className="inline-flex items-center">
          <RefStatusBadge status={status} />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        {STATUS.map((s) => (
          <DropdownMenuItem key={s} onClick={() => submit(s)} disabled={pending}>
            <span className="text-xs">{s}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
      {/* form “virtual” para cumplir con server action (por si lo necesitas en el futuro) */}
      <form ref={formRef} action={setStatusAction} className="hidden">
        <input type="hidden" name="id" defaultValue={id} />
        <input type="hidden" name="status" defaultValue={status} />
      </form>
    </DropdownMenu>
  );
}
