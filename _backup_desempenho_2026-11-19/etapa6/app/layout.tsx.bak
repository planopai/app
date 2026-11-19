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
const SCRIPT_RECUPERACAO = String.raw`(function(){try{
var feito=false,K="pai_recuperacao_tela",KD="pai_recuperacao_diag",erros=[];
function anota(t){t=String(t||"").slice(0,220);if(erros.indexOf(t)<0&&erros.length<8)erros.push(t);}
window.addEventListener("error",function(e){var t=e&&e.target;
if(t&&t!==window&&(t.src||t.href)){anota("Arquivo não carregou: "+(t.src||t.href).replace(location.origin,""));}
else{anota("Erro: "+(e&&e.message)+" "+String((e&&e.filename)||"").replace(location.origin,"")+":"+(e&&e.lineno||""));}},true);
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;anota("Promessa: "+(r&&(r.message||r)));});
function esc(t){return String(t).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
function diag(){var sw=navigator.serviceWorker;var ua=navigator.userAgent.match(/OS (\d+[_\d]*)/);
var l=["Tela: "+location.pathname,"Internet: "+(navigator.onLine!==false?"sim":"não"),"Modo offline ativo: "+(sw&&sw.controller?"sim":"não"),"iOS: "+(ua?ua[1].replace(/_/g,"."):"-"),"Abriu em: "+Math.round(performance.now()/1000)+" s"];
var ant="";try{ant=sessionStorage.getItem(KD)||"";}catch(e){}
return l.concat(erros).join("\n")+(ant?"\n--- tentativa anterior ---\n"+ant:"");}
function aviso(online){if(document.getElementById("pai-aviso-recuperacao"))return;
var d=document.createElement("div");d.id="pai-aviso-recuperacao";
d.setAttribute("style","position:fixed;inset:0;z-index:2147483647;background:#fff;color:#313C55;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;overflow:auto");
var titulo=online?"O PAI não conseguiu abrir":"Esta tela não está guardada para uso sem internet";
var texto=online?"Toque em Tentar de novo. Se continuar, tire um print desta tela e mande para o suporte.":"Conecte à internet e toque em Tentar de novo. As ações já registradas neste aparelho continuam guardadas.";
d.innerHTML='<p style="font-size:19px;font-weight:800;margin:0 0 10px">'+titulo+'</p><p style="font-size:15px;margin:0 0 22px;max-width:340px;line-height:1.45">'+texto+'</p><button type="button" style="font-size:16px;font-weight:700;padding:12px 22px;border-radius:12px;border:0;background:#313C55;color:#fff">Tentar de novo</button><pre style="margin:22px 0 0;max-width:100%;white-space:pre-wrap;word-break:break-all;text-align:left;font-size:11px;line-height:1.4;color:#5B6478">'+esc(diag())+'</pre>';
d.querySelector("button").onclick=function(){try{sessionStorage.removeItem(K);sessionStorage.removeItem(KD);}catch(e){}location.reload();};
(document.body||document.documentElement).appendChild(d);detalhar(d.querySelector("pre"));}
function detalhar(pre){try{var mais=[];var sw=navigator.serviceWorker;
var pReg=sw&&sw.getRegistration?sw.getRegistration().then(function(r){if(!r){mais.push("Service worker: nenhum");return;}
function nome(w){return w?String(w.scriptURL||"").split("/").pop()+" ("+w.state+")":"-";}
mais.push("SW ativo: "+nome(r.active));if(r.installing)mais.push("SW instalando: "+nome(r.installing));if(r.waiting)mais.push("SW esperando: "+nome(r.waiting));}).catch(function(e){mais.push("SW erro: "+e);}):Promise.resolve();
var pCache=window.caches?caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.open(k).then(function(c){return c.keys();}).then(function(x){mais.push("Cache "+k.replace(location.origin,"")+": "+x.length);});}));}).then(function(){
return caches.match(location.pathname,{ignoreSearch:true}).then(function(r){if(!r){mais.push("Tela guardada: não");return;}
return r.text().then(function(h){var a=(h.match(/\/_next\/static\/[^"'\s)\\]+\.(?:js|css)/g)||[]).filter(function(v,i,l){return l.indexOf(v)===i;});var falta=0,ex="";
return Promise.all(a.map(function(u){return caches.match(u,{ignoreSearch:true}).then(function(x){if(!x){falta++;if(!ex)ex=u;}});})).then(function(){mais.push("Tela guardada: sim; arquivos "+a.length+", faltando "+falta+(ex?" (ex.: "+ex+")":""));});});});}).catch(function(e){mais.push("Cache erro: "+e);}):Promise.resolve();
Promise.all([pReg,pCache]).then(function(){pre.textContent=pre.textContent+"\n"+mais.join("\n");});}catch(e){}}
function conferir(){if(feito||window.__paiHidratou)return;feito=true;
var online=navigator.onLine!==false,ult=0;
try{ult=+sessionStorage.getItem(K)||0;}catch(e){}
if(online&&Date.now()-ult>60000){
try{sessionStorage.setItem(K,String(Date.now()));sessionStorage.setItem(KD,diag());}catch(e){}
var p=location.pathname;
var limpar=window.caches?Promise.all(["start-url","pai-pages-v2"].map(function(n){return caches.open(n).then(function(c){return c.delete(p,{ignoreSearch:true});});})):Promise.resolve();
limpar.catch(function(){}).then(function(){location.reload();});return;}
aviso(online);}
window.addEventListener("load",function(){setTimeout(conferir,6000);});
setTimeout(conferir,25000);
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