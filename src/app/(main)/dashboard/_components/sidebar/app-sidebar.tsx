"use client";

import * as React from "react";
import Link from "next/link";
import { Settings, CircleHelp, Search, Database, ClipboardList, File, Command } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { useCurrentUser } from "@/hooks/use-current-user";

// ⬇️ ahora este módulo SÍ exporta NavGroup/NavMainItem
import { sidebarItems, type SidebarItem, type NavGroup, type NavMainItem } from "@/navigation/sidebar/sidebar-items";
import type { UserRole } from "@/types/roles";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

const data = {
  navSecondary: [
    { title: "Settings", url: "#", icon: Settings },
    { title: "Get Help", url: "#", icon: CircleHelp },
    { title: "Search", url: "#", icon: Search },
  ],
  documents: [
    { name: "Data Library", url: "#", icon: Database },
    { name: "Reports", url: "#", icon: ClipboardList },
    { name: "Word Assistant", url: "#", icon: File },
  ],
};

// ---- helpers de rol y mapeo ----
function filterByRole(items: SidebarItem[], role: UserRole | null): SidebarItem[] {
  const allowed = (it: SidebarItem) => !it.requiredRoles || (role != null && it.requiredRoles.includes(role));

  const walk = (list: SidebarItem[]): SidebarItem[] =>
    list
      .filter(allowed)
      .map((it) => {
        const kids = it.children ? walk(it.children) : undefined;
        return { ...it, children: kids && kids.length ? kids : undefined };
      })
      .filter((it) => it.href || it.children);

  return walk(items);
}

function mapSidebarToNavItem(it: SidebarItem): NavMainItem {
  return {
    title: it.title,
    url: it.href ?? "#",
    icon: it.icon,
    newTab: it.newTab,
    comingSoon: it.comingSoon,
    subItems: it.children?.map(mapSidebarToNavItem),
  };
}

/** Agrupa todo en un solo grupo "main". Si luego quieres múltiples grupos, aquí los armas. */
function sidebarItemsToNavGroups(items: SidebarItem[]): NavGroup[] {
  return [
    {
      id: "main",
      items: items.map(mapSidebarToNavItem),
    },
  ];
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { firebaseUser, userDoc, loading } = useCurrentUser();

  const effectiveRole: UserRole | null = (userDoc?.role as UserRole) ?? null;

  // 1) filtra por rol
  const filtered: SidebarItem[] = React.useMemo(() => filterByRole(sidebarItems, effectiveRole), [effectiveRole]);

  // 2) convierte a grupos que NavMain entiende
  const navGroups: NavGroup[] = React.useMemo(() => sidebarItemsToNavGroups(filtered), [filtered]);

  // 3) datos para NavUser
  const userForNav = React.useMemo(
    () => ({
      name: userDoc?.displayName ?? firebaseUser?.displayName ?? userDoc?.email ?? "Usuario",
      email: userDoc?.email ?? firebaseUser?.email ?? "",
      avatar: userDoc?.photoURL ?? firebaseUser?.photoURL ?? "",
    }),
    [firebaseUser, userDoc],
  );

  if (loading) {
    return (
      <Sidebar {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
                <div className="flex items-center gap-2">
                  <Command />
                  <span className="bg-muted h-4 w-28 animate-pulse rounded" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <div className="space-y-2 p-2">
            <div className="bg-muted h-8 w-full animate-pulse rounded" />
            <div className="bg-muted h-8 w-5/6 animate-pulse rounded" />
            <div className="bg-muted h-8 w-4/6 animate-pulse rounded" />
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="p-2">
            <div className="bg-muted h-10 w-full animate-pulse rounded" />
          </div>
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/dashboard/default">
                <Command />
                <span className="text-base font-semibold">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* NavMain ahora recibe NavGroup[] */}
        <NavMain items={navGroups} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={userForNav} />
      </SidebarFooter>
    </Sidebar>
  );
}
