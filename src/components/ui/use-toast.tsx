"use client";

import * as React from "react";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

type ToastInternal = ToastOptions & { id: number };

const ToastContext = React.createContext<{
  toasts: ToastInternal[];
  addToast: (opts: ToastOptions) => void;
  removeToast: (id: number) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastInternal[]>([]);

  const addToast = (opts: ToastOptions) => {
    setToasts((prev) => [...prev, { id: Date.now(), ...opts }]);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider/>");
  return ctx;
}
