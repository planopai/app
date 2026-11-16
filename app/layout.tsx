import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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

/* Tela do celular (22/10/2026): sem zoom — nem por pinça (Android), nem automático ao tocar num campo (iPhone).
   O Next.js pede a viewport e a cor do tema aqui, fora do metadata. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  /* 22/10/2026: SEM viewportFit "cover". Com ele o Android desenha o app por baixo da barra de status
     (o título encostava na hora/bateria) e sobrava faixa vazia embaixo da barra de baixo. */
  themeColor: "#313C55",
};

export const metadata: Metadata = {
  title: "App Plano PAI 2.0",
  description: "Aplicação WEB Plano PAI 2.0",
  applicationName: "App Plano PAI 2.0",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#313C55" }],
  },
  appleWebApp: {
    capable: true,
    title: "App Plano PAI 2.0",
    statusBarStyle: "black-translucent",
  },
};

/*
 * 16/11/2026: recuperação da tela parada no logo.
 *
 * Se a tela guardada no aparelho for de uma versão antiga, os arquivos de estilo e
 * de script dela não existem mais: a página fica parada no logo, sem estilo. Este
 * script não depende desses arquivos. Se o app não abrir (RegisterSW marca
 * window.__paiHidratou), ele apaga a cópia guardada desta tela e recarrega pela
 * internet, no máximo uma vez por minuto. Sem internet, mostra um aviso no lugar
 * de deixar a pessoa olhando para o logo.
 */
const SCRIPT_RECUPERACAO = `(function(){try{
var feito=false,K="pai_recuperacao_tela";
function aviso(){if(document.getElementById("pai-aviso-recuperacao"))return;
var d=document.createElement("div");d.id="pai-aviso-recuperacao";
d.setAttribute("style","position:fixed;inset:0;z-index:2147483647;background:#fff;color:#313C55;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif");
d.innerHTML='<p style="font-size:19px;font-weight:800;margin:0 0 10px">Esta tela não está guardada para uso sem internet</p><p style="font-size:15px;margin:0 0 22px;max-width:340px;line-height:1.45">Conecte à internet e toque em Tentar de novo. As ações já registradas neste aparelho continuam guardadas.</p><button type="button" style="font-size:16px;font-weight:700;padding:12px 22px;border-radius:12px;border:0;background:#313C55;color:#fff">Tentar de novo</button>';
d.querySelector("button").onclick=function(){location.reload();};
(document.body||document.documentElement).appendChild(d);}
function conferir(){if(feito||window.__paiHidratou)return;feito=true;
var online=navigator.onLine!==false,ult=0;
try{ult=+sessionStorage.getItem(K)||0;}catch(e){}
if(online&&Date.now()-ult>60000){
try{sessionStorage.setItem(K,String(Date.now()));}catch(e){}
var p=location.pathname;
var limpar=window.caches?Promise.all(["start-url","pai-pages-v2"].map(function(n){return caches.open(n).then(function(c){return c.delete(p,{ignoreSearch:true});});})):Promise.resolve();
limpar.catch(function(){}).then(function(){location.reload();});return;}
aviso();}
window.addEventListener("load",function(){setTimeout(conferir,4000);});
setTimeout(conferir,20000);
}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get("active_theme")?.value;
  const isScaled = Boolean(activeThemeValue?.endsWith("-scaled"));

  const uidCookie = cookieStore.get("pai_uid")?.value || null;

  const initialPerms = await getInitialPerms();

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={nunito.variable} // ✅ injeta variável CSS
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#313C55" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#313C55" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="App Plano PAI 2.0" />
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_RECUPERACAO }} />
      </head>

      <body
        className={cn(
          "bg-background overscroll-none antialiased touch-manipulation font-[var(--font-nunito)]", // ✅ NUNITO GLOBAL · touch-manipulation: sem zoom por dois toques
          activeThemeValue ? `theme-${activeThemeValue}` : "",
          isScaled ? "theme-scaled" : ""
        )}
      >
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
              <AppShell hideOnRoutes={["/login"]}>
                {children}
              </AppShell>
            </PermsProvider>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}