"use client";

import type { ReactNode } from "react";

import { DelegateStoreProvider } from "@/stores/delegate/delegate-provider";

export function DashboardClientProviders({ children }: { children: ReactNode }) {
  return <DelegateStoreProvider>{children}</DelegateStoreProvider>;
}
