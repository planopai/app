// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: false,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/app-build-manifest\.json$/],
  runtimeCaching: [
    // Não cachear a API (leva cookies sempre)
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/php/"),
      handler: "NetworkOnly",
      options: { cacheName: "api-php-network-only" },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/push/"),
      handler: "NetworkOnly",
      options: { cacheName: "push-network-only" },
    },
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/cdn\.onesignal\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "onesignal-cdn",
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "document",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
module.exports = withPWA({
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // ✅ Liberação dos domínios para <Image />
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 96, 128, 160, 180, 196, 256],
    domains: [
      // Domínio principal (onde ficam as imagens enviadas via PHP)
      "planoassistencialintegrado.com.br",
      // S3 usado no projeto
      "rp-master3-prod.s3.us-east-1.amazonaws.com",
      // Unsplash (usado em prévias)
      "images.unsplash.com",
      // (opcional) se houver outros domínios de imagem, adicione aqui
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; img-src * blob: data:; media-src 'none'; script-src 'none'; sandbox;",
  },

  // ✅ Rewrite: encaminha /api/php/:path* para a raiz do site principal
  async rewrites() {
    return [
      {
        source: "/api/php/:path*",
        destination: "https://planoassistencialintegrado.com.br/:path*",
      },
    ];
  },
});
