// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";

import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ActiveThemeProvider } from "@/components/active-theme";
import AppShell from "@/components/app-shell";

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
            {/* AppShell */}
            <AppShell hideOnRoutes={["/login"]}>{children}</AppShell>

            {/* ✅ OneSignal v16 - Custom Code + escopo raiz */}
            <Script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer />
            <Script id="onesignal-v16-init" strategy="afterInteractive">
              {`
                window.OneSignalDeferred = window.OneSignalDeferred || [];
                OneSignalDeferred.push(async function(OneSignal) {
                  await OneSignal.init({
                    appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                    safari_web_id: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",
                    notifyButton: {
                      enable: true,
                      prenotify: true,
                      showCredit: false,
                      position: "bottom-right",
                      text: {
                        "tip.state.unsubscribed": "Ativar notificações",
                        "tip.state.subscribed": "Notificações ativadas",
                        "tip.state.blocked": "Notificações bloqueadas",
                        "message.prenotify": "Clique para ativar as notificações",
                        "message.action.subscribing": "Inscrevendo...",
                        "message.action.subscribed": "Inscrição concluída!",
                        "message.action.resubscribed": "Inscrito novamente",
                        "message.action.unsubscribed": "Você não receberá notificações",
                        "dialog.main.title": "Notificações do site",
                        "dialog.main.button.subscribe": "ATIVAR",
                        "dialog.main.button.unsubscribe": "DESATIVAR",
                        "dialog.blocked.title": "Notificações bloqueadas",
                        "dialog.blocked.message": "Permita as notificações nas configurações do navegador"
                      }
                    },
                    serviceWorkerPath: "/OneSignalSDKWorker.js",
                    serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
                    serviceWorkerParam: { scope: "/" },
                    allowLocalhostAsSecureOrigin: true,
                  });

                  OneSignal.Debug.setLogLevel("warn");
                });
              `}
            </Script>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
