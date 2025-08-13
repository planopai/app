"use client";
import Script from "next/script";

// defina no .env: NEXT_PUBLIC_ONESIGNAL_APP_ID=...
const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "c4fc4716-c163-461d-b8a0-50fefd32836b";

export default function PushClient() {
  return (
    <>
      {/* SDK v16 */}
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
      <Script id="onesignal-init" strategy="afterInteractive">
        {`
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          OneSignalDeferred.push(async function(OneSignal) {
            // GARANTE o escopo isolado em /push/
            OneSignal.SERVICE_WORKER_PARAM        = { scope: "/push/" };
            OneSignal.SERVICE_WORKER_PATH         = "push/OneSignalSDKWorker.js";
            OneSignal.SERVICE_WORKER_UPDATER_PATH = "push/OneSignalSDK.sw.js";

            await OneSignal.init({
              appId: "${appId}",
              notifyButton: { enable: false },
              allowLocalhostAsSecureOrigin: ${process.env.NODE_ENV === "development" ? "true" : "false"}
            });
          });
        `}
      </Script>
    </>
  );
}
