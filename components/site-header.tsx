"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ArrowLeft } from "lucide-react";

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
        <SidebarTrigger className="-ml-1" />

        {/* Home */}
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/" aria-label="Início" title="Início">
            <Home className="h-4 w-4" />
          </Link>
        </Button>

        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        <h1 className="text-base font-medium"></h1>

        {/* Direita */}
        <div className="ml-auto flex items-center gap-2">
          {/* Voltar do lado do Tema */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.back()}
            aria-label="Voltar"
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <ThemeSelector />
          <ModeSwitcher />
        </div>
      </div>
    </header>
  );
}