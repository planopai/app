"use client";

import { useThemeConfig } from "./active-theme";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import { Palette, ChevronDown } from "lucide-react";

const DEFAULT_THEMES = [
  { name: "Padrão", value: "default" },
  { name: "Azul", value: "blue" },
  { name: "Verde", value: "green" },
  { name: "Laranja", value: "amber" },
];

const SCALED_THEMES = [
  { name: "Padrão", value: "default-scaled" },
  { name: "Padrão 02", value: "blue-scaled" },
];

const MONO_THEMES = [
  { name: "Personalizado", value: "mono-scaled" },
];

export function ThemeSelector() {
  const { activeTheme, setActiveTheme } = useThemeConfig();

  return (
    <div className="flex items-center">
      <Label htmlFor="theme-selector" className="sr-only">
        Tema
      </Label>

      <Select value={activeTheme} onValueChange={setActiveTheme}>
        

        <SelectContent align="end">
          <SelectGroup>
            <SelectLabel>Padrão</SelectLabel>
            {DEFAULT_THEMES.map((theme) => (
              <SelectItem key={theme.value} value={theme.value}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup>

          <SelectSeparator />

          <SelectGroup>
            <SelectLabel>Dimensionada</SelectLabel>
            {SCALED_THEMES.map((theme) => (
              <SelectItem key={theme.value} value={theme.value}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup>

          <SelectSeparator />

          <SelectGroup>
            <SelectLabel>Fonte Espaçada</SelectLabel>
            {MONO_THEMES.map((theme) => (
              <SelectItem key={theme.value} value={theme.value}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}