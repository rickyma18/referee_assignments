"use client";
import * as React from "react";

import { Button } from "@/components/ui/button";

export function ImageUploader({
  value,
  onUploaded,
  disabled,
}: {
  value?: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function onFile(file: File) {
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    try {
      const res = await fetch("/api/uploads/referee-photo", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.message ?? "Upload error");
      onUploaded(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled ?? busy}>
        {busy ? "Subiendo..." : value ? "Cambiar foto" : "Subir foto"}
      </Button>
      {value ? (
        <a href={value} target="_blank" className="text-xs underline">
          Ver actual
        </a>
      ) : null}
    </div>
  );
}
