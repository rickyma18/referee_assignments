// ======================================================
// src/app/(main)/dashboard/layout.tsx
// ======================================================
import { ReactNode } from "react";

import { cookies } from "next/headers";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { AuthGuard } from "@/components/auth-guard";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ToastViewport } from "@/components/ui/toast";
import { ToastProvider } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getPreference } from "@/server/server-actions";
import {
  SIDEBAR_VARIANT_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  type SidebarVariant,
  type SidebarCollapsible,
  type ContentLayout,
  type NavbarStyle,
} from "@/types/preferences/layout";

import { DashboardClientProviders } from "./_components/dashboard-client-providers";
import { NavbarControls } from "./_components/sidebar/navbar-controls";
import { SearchDialog } from "./_components/sidebar/search-dialog";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  const [sidebarVariant, sidebarCollapsible, contentLayout, navbarStyle] = await Promise.all([
    getPreference<SidebarVariant>("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference<SidebarCollapsible>("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
    getPreference<ContentLayout>("content_layout", CONTENT_LAYOUT_VALUES, "centered"),
    getPreference<NavbarStyle>("navbar_style", NAVBAR_STYLE_VALUES, "scroll"),
  ]);

  const layoutPreferences = {
    contentLayout,
    variant: sidebarVariant,
    collapsible: sidebarCollapsible,
    navbarStyle,
  };

  return (
    // 🔐 Todos estos roles pueden entrar al dashboard
    <AuthGuard allowedRoles={["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"]}>
      <ToastProvider>
        {/* ✅ Provider CLIENT para hooks (delegate store) sin convertir este layout a client */}
        <DashboardClientProviders>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar variant={sidebarVariant} collapsible={sidebarCollapsible} />

            <SidebarInset
              data-content-layout={contentLayout}
              className={cn(
                "flex h-screen flex-col overflow-hidden",
                "data-[content-layout=centered]:!mx-auto data-[content-layout=centered]:max-w-screen-2xl",
                "max-[113rem]:peer-data-[variant=inset]:!mr-2 min-[101rem]:peer-data-[variant=inset]:peer-data-[state=collapsed]:!mr-auto",
              )}
            >
              {/* ================= NAVBAR ================= */}
              <header
                data-navbar-style={navbarStyle}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear",
                  "data-[navbar-style=sticky]:bg-background/50 data-[navbar-style=sticky]:sticky data-[navbar-style=sticky]:top-0",
                  "data-[navbar-style=sticky]:z-50 data-[navbar-style=sticky]:backdrop-blur-md",
                )}
              >
                <div className="flex w-full items-center justify-between px-4 lg:px-6">
                  <div className="flex items-center gap-1 lg:gap-2">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mx-2 h-4" />
                    <SearchDialog />
                  </div>
                  <NavbarControls {...layoutPreferences} />
                </div>
              </header>

              {/* ================= CONTENT ================= */}
              <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">{children}</div>
            </SidebarInset>
          </SidebarProvider>

          <ToastViewport />
        </DashboardClientProviders>
      </ToastProvider>
    </AuthGuard>
  );
}
