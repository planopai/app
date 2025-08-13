// components/OneSignalGlobal.tsx
"use client";
import Script from "next/script";

export default function OneSignalGlobal() {
    return (
        <>
            <Script src="https://cdn.onesignal.com/sdks/OneSignalSDK.js" strategy="afterInteractive" />
            <Script id="onesignal-init" strategy="afterInteractive">
                {`
          window.OneSignal = window.OneSignal || [];
          OneSignal.push(function () {
            OneSignal.SERVICE_WORKER_PARAM        = { scope: '/push/' };
            OneSignal.SERVICE_WORKER_PATH         = 'push/OneSignalSDKWorker.js';
            OneSignal.SERVICE_WORKER_UPDATER_PATH = 'push/OneSignalSDK.sw.js';
            OneSignal.init({
              appId: 'c4fc4716-c163-461d-b8a0-50fefd32836b',
              notifyButton: { enable: false }
            });
          });
        `}
            </Script>
        </>
    );
}
