"use client";

import * as React from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Alterna claro/escuro.
 *
 * O app tem dois mecanismos de tema: o ThemeProvider (next-themes, classe `dark` no <html>) e a preferência
 * "pai_tema" (localStorage + evento "pai_tema_change") usada pelas telas já migradas, como o Quadro.
 * Este botão mexe nos dois e acompanha o botão de tema do Quadro, para ficarem sempre iguais.
 */
const CHAVE = "pai_tema";
const EVENTO = "pai_tema_change";

export function ModeSwitcher() {
  const { setTheme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    const aoMudar = () => {
      try {
        const v = window.localStorage.getItem(CHAVE);
        if (v !== "claro" && v !== "escuro") return;
        const alvo = v === "escuro" ? "dark" : "light";
        if (document.documentElement.classList.contains("dark") !== (alvo === "dark")) setTheme(alvo);
      } catch {
        /* sem armazenamento */
      }
    };
    window.addEventListener(EVENTO, aoMudar);
    window.addEventListener("storage", aoMudar);
    return () => {
      window.removeEventListener(EVENTO, aoMudar);
      window.removeEventListener("storage", aoMudar);
    };
  }, [setTheme]);

  const toggleTheme = React.useCallback(() => {
    const novoEscuro = resolvedTheme !== "dark";
    setTheme(novoEscuro ? "dark" : "light");
    try {
      window.localStorage.setItem(CHAVE, novoEscuro ? "escuro" : "claro");
    } catch {
      /* só o tema do app muda */
    }
    window.dispatchEvent(new Event(EVENTO));
  }, [resolvedTheme, setTheme]);

  return (
    <Button
      variant="ghost"
      className="group/toggle h-8 w-8 px-0"
      onClick={toggleTheme}
    >
      <SunIcon className="hidden [html.dark_&]:block" />
      <MoonIcon className="hidden [html.light_&]:block" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
