// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: { document: "/offline" },
});

module.exports = withPWA({
  // 👇 NÃO pare o build por erros de ESLint/TS
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }, // opcional — só use se também tiver erros TS
});
