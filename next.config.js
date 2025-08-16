// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: false, // mantém desativado p/ não conflitar com OneSignal
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/app-build-manifest\.json$/],
  runtimeCaching: [
    // ✅ NUNCA cachear a API PHP (precisa levar cookies sempre)
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/php/"),
      handler: "NetworkOnly",
      options: {
        cacheName: "api-php-network-only",
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/push/"),
      handler: "NetworkOnly",
      options: {
        cacheName: "push-network-only",
      },
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
        cacheableResponse: {
          statuses: [0, 200],
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
        cacheableResponse: {
          statuses: [0, 200],
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
        cacheableResponse: {
          statuses: [0, 200],
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
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
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

  // ✅ Rewrite: transforma /api/php/* em mesma origem (passa cookie no iOS)
  async rewrites() {
    return [
      {
        source: "/api/php/:path*",
        // PHP está na raiz do site principal (HostGator)
        destination: "https://planoassistencialintegrado.com.br/api/php/:path*",
      },
    ];
  },
});
