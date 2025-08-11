// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";

import "./globals.css";
import { cn } from "@/lib/utils";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = {
  // Título padrão e template por página
  title: {
    default: "App Plano PAI 2.0",
    template: "%s | App Plano PAI 2.0",
  },
  description: "Aplicação WEB Plano PAI 2.0",
  applicationName: "App Plano PAI 2.0",

  // PWA
  themeColor: "#059de0",
  // Se você criou app/manifest.ts, o Next já serve /manifest.webmanifest automaticamente.
  // Mantemos declarado aqui para garantir a tag <link rel="manifest">.
  manifest: "/manifest.webmanifest",

  // Ícones
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#059de0" }],
  },

  // iOS (instalável como app)
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "App Plano PAI 2.0",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Next 15: cookies() pode ser Promise — use await
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
