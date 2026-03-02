import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Nunito } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";
import OneSignalInit from "@/components/OneSignalInit";
import RegisterSW from "@/components/RegisterSW";

import { PermsProvider } from "./_perms/PermsProvider";
import { getInitialPerms } from "./_perms/getPermsServer";

/* ===========================
   ✅ Fonte Nunito (GLOBAL)
=========================== */
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

/* ===========================
   Config Next
=========================== */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "App Plano PAI 2.0",
  description: "Aplicação WEB Plano PAI 2.0",
  applicationName: "App Plano PAI 2.0",
  themeColor: "#059de0",
  manifest: "/manifest.webmanifest",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#059de0" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "App Plano PAI 2.0",
    statusBarStyle: "black-translucent",
  },
};

/* ======================================================
   ROOT LAYOUT
====================================================== */

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* ---------------- Cookies ---------------- */
  /* ---------------- Cookies ---------------- */
  const cookieStore = await cookies();

  const activeThemeValue = cookieStore.get("active_theme")?.value;
  const isScaled = Boolean(activeThemeValue?.endsWith("-scaled"));

  const uidCookie = cookieStore.get("pai_uid")?.value || null;

  /* ---------------- Permissões ---------------- */
  const initialPerms = await getInitialPerms();

  /* ---------------- Headers ---------------- */
  const headersList = await headers();

  const pathname =
    headersList.get("x-pathname") ??
    headersList.get("next-url") ??
    "";

  const isFullscreen = pathname.startsWith("/fullscreen");

  /* =================================================== */

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={nunito.variable}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#059de0" />

        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" sizes="16x16" href="/favicon-16x16.png" />

        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#059de0" />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta
          name="apple-mobile-web-app-title"
          content="App Plano PAI 2.0"
        />
      </head>

      <body
        className={cn(
          "bg-background overscroll-none antialiased font-[var(--font-nunito)]",
          activeThemeValue ? `theme-${activeThemeValue}` : "",
          isScaled ? "theme-scaled" : ""
        )}
      >
        {/* Services */}
        <RegisterSW />
        <OneSignalInit />

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <ActiveThemeProvider initialTheme={activeThemeValue}>
            <PermsProvider
              key={uidCookie ?? "nouid"}
              userKey={uidCookie}
              initialPerms={initialPerms}
            >
              {/* ✅ FULLSCREEN SEM SIDEBAR */}
              {isFullscreen ? (
                children
              ) : (
                <AppShell hideOnRoutes={["/login"]}>
                  {children}
                </AppShell>
              )}
            </PermsProvider>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}