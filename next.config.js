// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",          // gera sw.js e workbox no /public
  register: true,          // auto registra o service worker
  skipWaiting: true,       // aplica SW novo assim que possível
  disable: process.env.NODE_ENV === "development", // desliga no dev
  runtimeCaching: [
    // Páginas e navegação (SSR/rotas)
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: { cacheName: "pages", networkTimeoutSeconds: 10 },
    },
    // APIs do seu app (ex.: /api/orders)
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: { cacheName: "api", networkTimeoutSeconds: 10 },
    },
    // Imagens
    {
      urlPattern: /\/.*\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "images", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
    },
    // Google Fonts
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: "CacheFirst",
      options: { cacheName: "google-fonts", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
    },
  ],
  fallbacks: {
    // rota de fallback quando offline (criaremos já já)
    document: "/offline",
  },
});

module.exports = withPWA({
  // suas outras configs do Next aqui
});
