"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronRight } from "lucide-react";

import { DynamicGroupsChildren } from "@/app/(main)/dashboard/_components/sidebar/dynamic-groups-children";
import { DynamicMatchdaysChildren } from "@/app/(main)/dashboard/_components/sidebar/dynamic-matchday-children";
import { DynamicTeamsChildren } from "@/app/(main)/dashboard/_components/sidebar/dynamic-teams-children";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NavGroup, NavMainItem } from "@/navigation/sidebar/sidebar-items";

interface NavMainProps {
  readonly items?: readonly NavGroup[];
}

const IsComingSoon = () => (
  <span className="ml-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">Soon</span>
);

function SimpleLinkItem({
  item,
  isActive,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
}) {
  return (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild aria-disabled={item.comingSoon} isActive={isActive(item.url)} tooltip={item.title}>
        <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
          {item.icon && <item.icon />}
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
  defaultOpen = false,
  children,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Collapsible
      key={item.title}
      asChild
      defaultOpen={defaultOpen ?? isSubmenuOpen(item.subItems)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            isActive={isActive(item.url, item.subItems)}
            tooltip={item.title}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.comingSoon && <IsComingSoon />}
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {children ?? (
            <SidebarMenuSub>
              {(item.subItems ?? []).map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton aria-disabled={subItem.comingSoon} isActive={isActive(subItem.url)} asChild>
                    <Link href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                      {subItem.icon && <subItem.icon />}
                      <span>{subItem.title}</span>
                      {subItem.comingSoon && <IsComingSoon />}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
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
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
          {(item.subItems ?? []).map((subItem) => (
            <DropdownMenuItem key={subItem.title} asChild>
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
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function NavMain({ items = [] }: NavMainProps) {
  const path = usePathname();
  const { state, isMobile } = useSidebar();

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (!url) return false;

    if (subItems?.length) {
      return path === url || subItems.some((sub) => sub.url === path);
    }
    return path === url;
  };

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) =>
    subItems?.some((sub) => path.startsWith(sub.url)) ?? false;

  return (
    <>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {(group.items ?? []).map((item) => {
                // 🔹 Dinámico: Administrar grupos
                const isDynamicGroups = item.title === "Grupos" && item.url === "/dashboard/leagues";
                if (isDynamicGroups) {
                  const openByRoute = path.startsWith("/dashboard/leagues");
                  if (state === "collapsed" && !isMobile) {
                    return <CollapsedDropdown key={item.title} item={item} isActive={isItemActive} />;
                  }
                  return (
                    <CollapsibleItem
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      isSubmenuOpen={isSubmenuOpen}
                      defaultOpen={openByRoute ? false : false}
                    >
                      <SidebarMenuSub>
                        <DynamicGroupsChildren />
                      </SidebarMenuSub>
                    </CollapsibleItem>
                  );
                }

                // 🔹 Dinámico: jornadas
                const isDynamicMatchdays = item.title === "Jornadas" && item.url === "/dashboard/leagues";
                if (isDynamicMatchdays) {
                  const openByRoute =
                    path.startsWith("/dashboard/leagues/") && path.includes("/groups/") && path.endsWith("/matchdays");
                  if (state === "collapsed" && !isMobile) {
                    return <CollapsedDropdown key={item.title} item={item} isActive={isItemActive} />;
                  }
                  return (
                    <CollapsibleItem
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      isSubmenuOpen={isSubmenuOpen}
                      defaultOpen={openByRoute ? true : false}
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
                    return <CollapsedDropdown key={item.title} item={item} isActive={isItemActive} />;
                  }
                  return (
                    <CollapsibleItem
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      isSubmenuOpen={isSubmenuOpen}
                      defaultOpen={openByRoute ? true : false}
                    >
                      <SidebarMenuSub>
                        <DynamicTeamsChildren />
                      </SidebarMenuSub>
                    </CollapsibleItem>
                  );
                }

                // 🔹 Ítems normales
                if (state === "collapsed" && !isMobile) {
                  if (!item.subItems) {
                    return <SimpleLinkItem key={item.title} item={item} isActive={isItemActive} />;
                  }
                  return <CollapsedDropdown key={item.title} item={item} isActive={isItemActive} />;
                }

                if (!item.subItems) {
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
