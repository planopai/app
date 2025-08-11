"use client";
import Script from "next/script";

const appId = "c4fc4716 - c163 - 461d-b8a0 - 50fefd32836b"; // defina no .env

export default function PushClient() {
    return (
        <>
            {/* SDK v16 - carrega no cliente */}
            <Script
                src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
                strategy="afterInteractive"
            />
            <Script id="onesignal-init" strategy="afterInteractive">
                {`
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          OneSignalDeferred.push(async function(OneSignal) {
            await OneSignal.init({
              appId: "${appId}",
              // opcional:
              // serviceWorkerParam: { scope: "/" }, // escopo padrão
              // safari_web_id: "web.onesignal.auto....", // só se usar Safari legado
              notifyButton: { enable: false }, // desliga o botão flutuante da OneSignal
              allowLocalhostAsSecureOrigin: true
            });
          });
        `}
            </Script>
        </>
    );
}
