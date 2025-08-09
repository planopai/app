import { cookies } from "next/headers";
import type { Metadata } from "next";

import "./globals.css";
import { cn } from "@/lib/utils";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";

// ⭐ importe o sidebar + header e os providers de layout
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header"; // opcional
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: "Orcish Dashboard",
  description:
    "A fully responsive analytics dashboard featuring dynamic charts, interactive tables, a collapsible sidebar, and a light/dark mode theme switcher. Built with modern web technologies, it ensures seamless performance across devices, offering an intuitive user interface for data visualization and exploration.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get("active_theme")?.value;
  const isScaled = activeThemeValue?.endsWith("-scaled");

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background overscroll-none font-sans antialiased",
          activeThemeValue ? `theme-${activeThemeValue}` : "",
          isScaled ? "theme-scaled" : ""
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <ActiveThemeProvider initialTheme={activeThemeValue}>
            {/* ⭐ Tudo abaixo garante sidebar fixa + conteúdo à direita em TODAS as rotas */}
            <SidebarProvider
              style={
                {
                  "--sidebar-width": "calc(var(--spacing) * 72)",
                  "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
              }
            >
              <AppSidebar variant="inset" />
              <SidebarInset>
                {/* opcional: header global; remova se não quiser */}
                <SiteHeader />
                <div className="flex flex-1 flex-col">{children}</div>
              </SidebarInset>
            </SidebarProvider>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
