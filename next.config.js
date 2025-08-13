// next.config.js
const withPWA = require("next-pwa")({
  dest: "public", // Gera o service worker e arquivos relacionados em /public
  register: true, // Registra automaticamente o service worker
  skipWaiting: true, // Atualiza imediatamente após nova versão
  disable: process.env.NODE_ENV === "development", // Desativa PWA em dev
  buildExcludes: [/app-build-manifest\.json$/], // Evita conflitos no build
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/push/"),
      handler: "NetworkOnly",
      method: "GET",
    },
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
        },
      },
    },
    {
      urlPattern: /^https:\/\/cdn\.onesignal\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "onesignal-cdn",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
        },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
        },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "document",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
        },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ["cdn.onesignal.com", "fonts.gstatic.com"],
  },
});
