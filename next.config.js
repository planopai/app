// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: false,          // ← IMPORTANTE com OneSignal
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: { document: "/offline" },
  // runtimeCaching: [ ... ] // adicione aqui se quiser caches específicos
});

module.exports = withPWA({
  // Não travar o build por lint/TS
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }, // opcional
});
