import type { Metadata } from "next";
import { cookies } from "next/headers";

import "./globals.css";
import { cn } from "@/lib/utils";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = {
  title: "App Plano PAI 2.0",
  description:
    "Aplicação WEB Plano PAI 2.0",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 👇 em Next 15, cookies() pode ser Promise—use await
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
            {/* AppShell decide quando mostrar/esconder o sidebar/header */}
            <AppShell hideOnRoutes={["/login"]}>{children}</AppShell>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
