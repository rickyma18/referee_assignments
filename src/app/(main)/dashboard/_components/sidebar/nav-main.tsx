"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronRight } from "lucide-react";

import { DynamicGroupsChildren } from "@/app/(main)/dashboard/_components/sidebar/dynamic-groups-children";
import { DynamicMatchdaysChildren } from "@/app/(main)/dashboard/_components/sidebar/dynamic-matchday-children";
import { DynamicTeamsChildren } from "@/app/(main)/dashboard/_components/sidebar/dynamic-teams-children";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { NavGroup, NavMainItem } from "@/navigation/sidebar/sidebar-items";

function IsComingSoon() {
  return (
    <span className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground ml-auto rounded-md border px-1.5 py-0.5 text-[10px]">
      Pronto
    </span>
  );
}

function SimpleLinkItem({
  item,
  isActive,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
}) {
  return (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton
        asChild
        disabled={item.comingSoon}
        tooltip={item.title}
        isActive={isActive(item.url, item.subItems)}
      >
        <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
          {item.icon && <item.icon className="[&>svg]:text-sidebar-foreground" />}
          <span>{item.title}</span>
          {item.comingSoon && <IsComingSoon />}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function CollapsibleItem({
  item,
  isActive,
  isSubmenuOpen,
  defaultOpen,
  children,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (item: NavMainItem) => boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const open = defaultOpen ?? isSubmenuOpen(item);

  return (
    <Collapsible asChild defaultOpen={open}>
      <SidebarMenuItem key={item.title}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={item.title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon className="[&>svg]:text-sidebar-foreground" />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto h-4 w-4 transition-transform data-[state=open]:rotate-90" />
            {item.comingSoon && <IsComingSoon />}
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Si me pasas children (dinámicos), uso eso; si no, uso los subItems normales */}
          {children ?? (
            <SidebarMenuSub>
              {(item.subItems ?? []).map((subItem) => (
                <SidebarMenuItem key={subItem.title}>
                  <SidebarMenuSubButton
                    asChild
                    className="focus-visible:ring-0"
                    aria-disabled={subItem.comingSoon}
                    isActive={isActive(subItem.url)}
                  >
                    <Link href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                      {subItem.icon && <subItem.icon className="[&>svg]:text-sidebar-foreground" />}
                      <span>{subItem.title}</span>
                      {subItem.comingSoon && <IsComingSoon />}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenuSub>
          )}
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function CollapsedDropdown({
  item,
  isActive,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
}) {
  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={item.title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon className="[&>svg]:text-sidebar-foreground" />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto h-4 w-4" />
            {item.comingSoon && <IsComingSoon />}
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" side="right" align="start">
          {(item.subItems ?? []).map((subItem, idx) => {
            const isLast = idx === (item.subItems?.length ?? 0) - 1;

            return (
              <div key={subItem.title}>
                <DropdownMenuItem asChild className={cn("cursor-pointer", subItem.comingSoon && "opacity-50")}>
                  <Link
                    href={subItem.url}
                    target={subItem.newTab ? "_blank" : undefined}
                    className="flex items-center gap-2"
                  >
                    {subItem.icon && <subItem.icon className="h-4 w-4" />}
                    <span>{subItem.title}</span>
                    {subItem.comingSoon && <IsComingSoon />}
                  </Link>
                </DropdownMenuItem>
                {!isLast && <DropdownMenuSeparator />}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/**
 * ✅ Dropdown colapsado para items DINÁMICOS
 * - En modo collapsed, los dinámicos NO traen subItems (se renderizan como <Dynamic...Children />)
 * - Antes se mostraba un dropdown vacío y por eso “no servían”.
 */
function CollapsedDynamicDropdown({
  item,
  isActive,
  children,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  children: ReactNode;
}) {
  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={item.title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon className="[&>svg]:text-sidebar-foreground" />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto h-4 w-4" />
            {item.comingSoon && <IsComingSoon />}
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" side="right" align="start">
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/**
 * ✅ FIX: groups puede venir undefined desde AppSidebar durante el primer render
 * (por ejemplo si se arma desde contexto o fetch).
 */
export function NavMain({ groups }: { groups?: NavGroup[] }) {
  const safeGroups = groups ?? [];

  const path = usePathname();
  const { isMobile, state } = useSidebar();

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (path === url) return true;
    if (!subItems?.length) return false;
    return subItems.some((s) => path === s.url || path.startsWith(`${s.url}/`));
  };

  const isSubmenuOpen = (item: NavMainItem) => {
    if (!item.subItems?.length) return false;
    return item.subItems.some((s) => path === s.url || path.startsWith(`${s.url}/`));
  };

  return (
    <>
      {safeGroups.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label ? (
            <div className="text-muted-foreground px-3 pb-2 text-xs font-medium">{group.label}</div>
          ) : null}

          <SidebarGroupContent>
            <SidebarMenu>
              {(group.items ?? []).map((item) => {
                // 🔹 Dinámico: Grupos
                const isDynamicGroups = item.title === "Grupos" && item.url === "/dashboard/leagues";
                if (isDynamicGroups) {
                  if (state === "collapsed" && !isMobile) {
                    return (
                      <CollapsedDynamicDropdown key={item.title} item={item} isActive={isItemActive}>
                        <DynamicGroupsChildren />
                      </CollapsedDynamicDropdown>
                    );
                  }

                  return (
                    <CollapsibleItem
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      isSubmenuOpen={isSubmenuOpen}
                      defaultOpen={false}
                    >
                      <SidebarMenuSub>
                        <DynamicGroupsChildren />
                      </SidebarMenuSub>
                    </CollapsibleItem>
                  );
                }

                // 🔹 Dinámico: Jornadas
                const isDynamicMatchdays = item.title === "Jornadas" && item.url === "/dashboard/leagues";
                if (isDynamicMatchdays) {
                  const openByRoute =
                    path.startsWith("/dashboard/leagues/") && path.includes("/groups/") && path.endsWith("/matchdays");

                  if (state === "collapsed" && !isMobile) {
                    return (
                      <CollapsedDynamicDropdown key={item.title} item={item} isActive={isItemActive}>
                        <DynamicMatchdaysChildren />
                      </CollapsedDynamicDropdown>
                    );
                  }

                  return (
                    <CollapsibleItem
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      isSubmenuOpen={isSubmenuOpen}
                      defaultOpen={openByRoute}
                    >
                      <SidebarMenuSub>
                        <DynamicMatchdaysChildren />
                      </SidebarMenuSub>
                    </CollapsibleItem>
                  );
                }

                // 🔹 Dinámico: Equipos
                const isDynamicTeams = item.title === "Equipos" && item.url === "/dashboard/leagues";
                if (isDynamicTeams) {
                  const openByRoute =
                    path.startsWith("/dashboard/leagues/") && path.includes("/groups/") && path.endsWith("/teams");

                  if (state === "collapsed" && !isMobile) {
                    return (
                      <CollapsedDynamicDropdown key={item.title} item={item} isActive={isItemActive}>
                        <DynamicTeamsChildren />
                      </CollapsedDynamicDropdown>
                    );
                  }

                  return (
                    <CollapsibleItem
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      isSubmenuOpen={isSubmenuOpen}
                      defaultOpen={openByRoute}
                    >
                      <SidebarMenuSub>
                        <DynamicTeamsChildren />
                      </SidebarMenuSub>
                    </CollapsibleItem>
                  );
                }

                // 🔹 Ítems normales
                if (state === "collapsed" && !isMobile) {
                  if (!item.subItems?.length) {
                    return <SimpleLinkItem key={item.title} item={item} isActive={isItemActive} />;
                  }
                  return <CollapsedDropdown key={item.title} item={item} isActive={isItemActive} />;
                }

                if (!item.subItems?.length) {
                  return <SimpleLinkItem key={item.title} item={item} isActive={isItemActive} />;
                }

                return (
                  <CollapsibleItem key={item.title} item={item} isActive={isItemActive} isSubmenuOpen={isSubmenuOpen} />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
