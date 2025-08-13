// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";

import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = {
  title: "App Plano PAI 2.0",
  description: "Aplicação WEB Plano PAI 2.0",
  applicationName: "App Plano PAI 2.0",
  themeColor: "#059de0",
  manifest: "/manifest", // ✅ Corrigido para rota do manifesto
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ],
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#059de0" }
    ]
  },
  appleWebApp: {
    capable: true,
    title: "App Plano PAI 2.0",
    statusBarStyle: "black-translucent"
  }
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get("active_theme")?.value;
  const isScaled = Boolean(activeThemeValue?.endsWith("-scaled"));

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
            <AppShell hideOnRoutes={["/login"]}>{children}</AppShell>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
