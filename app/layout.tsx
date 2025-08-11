// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";

import "./globals.css";
import { cn } from "@/lib/utils";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";
import PushClient from "@/components/push-client"; // OneSignal v16 (client)

export const metadata: Metadata = {
  title: { default: "App Plano PAI 2.0", template: "%s | App Plano PAI 2.0" },
  description: "Aplicação WEB Plano PAI 2.0",
  applicationName: "App Plano PAI 2.0",

  // PWA
  themeColor: "#059de0",
  manifest: "/manifest.webmanifest",

  // Ícones (inclui 16/32 p/ barra do navegador)
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#059de0" }],
  },

  // iOS (instalável como app)
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "App Plano PAI 2.0",
  },

  // Tela cheia e safe areas
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
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
            {/* AppShell decide quando mostrar/esconder o sidebar/header */}
            <AppShell hideOnRoutes={["/login"]}>{children}</AppShell>

            {/* OneSignal (SDK v16) */}
            <PushClient />
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
