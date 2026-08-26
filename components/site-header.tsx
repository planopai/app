"use client";

import { useEffect, useState } from "react";
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

  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const atualizarStatus = () => {
      setIsOnline(navigator.onLine);
    };

    // Estado inicial
    atualizarStatus();

    // Mudança de conexão
    window.addEventListener("online", atualizarStatus);
    window.addEventListener("offline", atualizarStatus);

    return () => {
      window.removeEventListener("online", atualizarStatus);
      window.removeEventListener("offline", atualizarStatus);
    };
  }, []);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />

        {/* Home */}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <Link
            href="/"
            aria-label="Início"
            title="Início"
          >
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

          {/* Status da conexão */}
          {isOnline !== null && (
            <div
              className="flex items-center gap-1.5 text-xs font-medium"
              aria-live="polite"
              title={
                isOnline
                  ? "Dispositivo conectado à internet"
                  : "Dispositivo sem conexão com a internet"
              }
            >
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  isOnline
                    ? "bg-green-500"
                    : "bg-orange-500",
                ].join(" ")}
              />

              <span
                className={
                  isOnline
                    ? "text-green-600 dark:text-green-400"
                    : "text-orange-600 dark:text-orange-400"
                }
              >
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          )}

          {/* Voltar */}
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

          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-4"
          />

          <ThemeSelector />
          <ModeSwitcher />
        </div>
      </div>
    </header>
  );
}