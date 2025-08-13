// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";

import "./globals.css";
import { cn } from "@/lib/utils";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";
import PWARegister from "@/components/pwa-register"; // registro manual do SW do next-pwa

export const metadata: Metadata = {
  title: { default: "App Plano PAI 2.0", template: "%s | App Plano PAI 2.0" },
  description: "Aplicação WEB Plano PAI 2.0",
  applicationName: "App Plano PAI 2.0",
  themeColor: "#059de0",
  manifest: "/manifest.webmanifest",
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "App Plano PAI 2.0",
  },
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ✅ cookies() tipado como Promise -> use await
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
            {/* PWA SW (next-pwa) */}
            <PWARegister />

            {/* AppShell */}
            <AppShell hideOnRoutes={["/login"]}>{children}</AppShell>

            {/* OneSignal v16 (escopo /push/) */}
            <Script
              src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
              defer
            />
            <Script id="onesignal-v16-init" strategy="afterInteractive">
              {`
                window.OneSignalDeferred = window.OneSignalDeferred || [];
                OneSignalDeferred.push(async function(OneSignal) {
                  OneSignal.SERVICE_WORKER_PARAM        = { scope: '/push/' };
                  OneSignal.SERVICE_WORKER_PATH         = 'push/OneSignalSDKWorker.js';
                  OneSignal.SERVICE_WORKER_UPDATER_PATH = 'push/OneSignalSDK.sw.js';

                  await OneSignal.init({
                    appId: 'c4fc4716-c163-461d-b8a0-50fefd32836b',
                    safari_web_id: 'web.onesignal.auto.47c70ae7-2660-4f5d-88d3-857f7dfd7254',
                    notifyButton: { enable: true }
                  });
                });
              `}
            </Script>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
