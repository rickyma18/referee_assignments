"use client";

import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { updateContentLayout, updateNavbarStyle } from "@/lib/layout-utils";
import { updateThemeMode, updateThemePreset } from "@/lib/theme-utils";
import { setValueToCookie } from "@/server/server-actions";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import type { SidebarVariant, SidebarCollapsible, ContentLayout, NavbarStyle } from "@/types/preferences/layout";
import { THEME_PRESET_OPTIONS, type ThemePreset, type ThemeMode } from "@/types/preferences/theme";

type LayoutControlsProps = {
  readonly variant: SidebarVariant;
  readonly collapsible: SidebarCollapsible;
  readonly contentLayout: ContentLayout;
  readonly navbarStyle: NavbarStyle;
};

export function LayoutControls(props: LayoutControlsProps) {
  const { variant, collapsible, contentLayout, navbarStyle } = props;

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset);

  const handleValueChange = async (key: string, value: any) => {
    if (key === "theme_mode") {
      updateThemeMode(value);
      setThemeMode(value as ThemeMode);
    }

    if (key === "theme_preset") {
      updateThemePreset(value);
      setThemePreset(value as ThemePreset);
    }

    if (key === "content_layout") {
      updateContentLayout(value);
    }

    if (key === "navbar_style") {
      updateNavbarStyle(value);
    }
    await setValueToCookie(key, value);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="text-sm leading-none font-medium">Configuración del diseño</h4>
            <p className="text-muted-foreground text-xs">Personaliza las preferencias del diseño de tu panel.</p>
          </div>

          <div className="space-y-3">
            {/* === TEMA === */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Tema</Label>
              <Select value={themePreset} onValueChange={(value) => handleValueChange("theme_preset", value)}>
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue placeholder="Seleccionar tema" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_PRESET_OPTIONS.map((preset) => (
                    <SelectItem key={preset.value} className="text-xs" value={preset.value}>
                      <span
                        className="size-2.5 rounded-full"
                        style={{
                          backgroundColor: themeMode === "dark" ? preset.primary.dark : preset.primary.light,
                        }}
                      />
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* === MODO === */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Modo</Label>
              <ToggleGroup
                className="w-full"
                size="sm"
                variant="outline"
                type="single"
                value={themeMode}
                onValueChange={(value) => handleValueChange("theme_mode", value)}
              >
                <ToggleGroupItem className="text-xs" value="light" aria-label="Modo claro">
                  Claro
                </ToggleGroupItem>
                <ToggleGroupItem className="text-xs" value="dark" aria-label="Modo oscuro">
                  Oscuro
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* === VARIANTE SIDEBAR === */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Variante de barra lateral</Label>
              <ToggleGroup
                className="w-full"
                size="sm"
                variant="outline"
                type="single"
                value={variant}
                onValueChange={(value) => handleValueChange("sidebar_variant", value)}
              >
                <ToggleGroupItem className="text-xs" value="inset" aria-label="Incrustado">
                  Incrustado
                </ToggleGroupItem>
                <ToggleGroupItem className="text-xs" value="sidebar" aria-label="Lateral">
                  Lateral
                </ToggleGroupItem>
                <ToggleGroupItem className="text-xs" value="floating" aria-label="Flotante">
                  Flotante
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* === ESTILO NAVBAR === */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Estilo de la barra superior</Label>
              <ToggleGroup
                className="w-full"
                size="sm"
                variant="outline"
                type="single"
                value={navbarStyle}
                onValueChange={(value) => handleValueChange("navbar_style", value)}
              >
                <ToggleGroupItem className="text-xs" value="sticky" aria-label="Fija">
                  Fija
                </ToggleGroupItem>
                <ToggleGroupItem className="text-xs" value="scroll" aria-label="Desplazable">
                  Desplazable
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* === COLAPSABLE === */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Barra lateral colapsable</Label>
              <ToggleGroup
                className="w-full"
                size="sm"
                variant="outline"
                type="single"
                value={collapsible}
                onValueChange={(value) => handleValueChange("sidebar_collapsible", value)}
              >
                <ToggleGroupItem className="text-xs" value="icon" aria-label="Ícono">
                  Ícono
                </ToggleGroupItem>
                <ToggleGroupItem className="text-xs" value="offcanvas" aria-label="Fuera del lienzo">
                  Fuera del lienzo
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* === DISEÑO DEL CONTENIDO === */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Diseño del contenido</Label>
              <ToggleGroup
                className="w-full"
                size="sm"
                variant="outline"
                type="single"
                value={contentLayout}
                onValueChange={(value) => handleValueChange("content_layout", value)}
              >
                <ToggleGroupItem className="text-xs" value="centered" aria-label="Centrado">
                  Centrado
                </ToggleGroupItem>
                <ToggleGroupItem className="text-xs" value="full-width" aria-label="Ancho completo">
                  Ancho completo
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
