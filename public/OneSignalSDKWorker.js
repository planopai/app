// mantém seu SW do PWA ativo junto com o OneSignal
try { importScripts('/sw.js'); } catch (_) { }
// OneSignal v16 worker
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');
