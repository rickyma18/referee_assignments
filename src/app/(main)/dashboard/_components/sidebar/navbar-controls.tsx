"use client";

import { DelegateSwitcher } from "@/components/delegate-switcher";
import { DelegateStoreProvider } from "@/context/delegate-context";

import { AccountSwitcher } from "./account-switcher";
import { LayoutControls, type LayoutControlsProps } from "./layout-controls";
import { ThemeSwitcher } from "./theme-switcher";

type NavbarControlsProps = LayoutControlsProps;

/**
 * NavbarControls - Controles del lado derecho del navbar
 *
 * Envuelve los controles con DelegateStoreProvider para que
 * DelegateSwitcher tenga acceso al contexto de delegado.
 */
export function NavbarControls(props: NavbarControlsProps) {
  return (
    <DelegateStoreProvider>
      <div className="flex items-center gap-2">
        <DelegateSwitcher />
        <LayoutControls {...props} />
        <ThemeSwitcher />
        <AccountSwitcher />
      </div>
    </DelegateStoreProvider>
  );
}
