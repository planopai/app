const withPWA = require("next-pwa")({
  dest: "public",
  register: false, // ✅ Desativa registro automático do SW para evitar conflito com OneSignal
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/app-build-manifest\.json$/],
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
          maxAgeSeconds: 60 * 60 * 24 * 365,
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
          maxAgeSeconds: 60 * 60 * 24 * 30,
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
          maxAgeSeconds: 60 * 60 * 24 * 30,
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
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true, // ✅ Ignora erros do ESLint no build
  },
  typescript: {
    ignoreBuildErrors: true, // ✅ Ignora erros de tipo no build
  },
  images: {
    domains: ["cdn.onesignal.com", "fonts.gstatic.com"],
  },
});
