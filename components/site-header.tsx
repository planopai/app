"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ArrowLeft, Palette, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeSelector } from "./theme-selector";
import { ModeSwitcher } from "./mode-switcher";

export function SiteHeader() {
  const router = useRouter();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">

        {/* Abrir/fechar sidebar */}
        <SidebarTrigger className="-ml-1" />

        {/* Botão Home */}
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/" title="Início">
            <Home className="h-4 w-4" />
          </Link>
        </Button>

        {/* Botão Voltar */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.back()}
          title="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        <h1 className="text-base font-medium"></h1>

        {/* Área direita */}
        <div className="ml-auto flex items-center gap-2">

          {/* Theme compacto (ícone + seta) */}
          <Button variant="ghost" size="sm" className="gap-1">
            <Palette className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>

          <ThemeSelector />

          <ModeSwitcher />
        </div>
      </div>
    </header>
  );
}