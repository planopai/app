const withPWA = require("next-pwa")({
  dest: "public",

  // O registro continua sendo feito pelo components/RegisterSW.tsx.
  register: false,

  // Faz a nova versão assumir o controle assim que estiver pronta.
  skipWaiting: true,
  clientsClaim: true,

  // O PWA deve atuar em toda a aplicação.
  scope: "/",
  sw: "sw.js",

  // O start_url é dinâmico porque o HTML varia conforme sessão/permissões.
  cacheStartUrl: true,
  dynamicStartUrl: true,

  // Ajuda o next/link a alimentar o cache das páginas visitadas online.
  cacheOnFrontEndNav: true,

  // Evita reload automático ao recuperar a conexão durante este primeiro teste.
  reloadOnOnline: false,

  // Em desenvolvimento não queremos SW/cache interferindo no diagnóstico.
  disable: process.env.NODE_ENV === "development",

  cleanupOutdatedCaches: true,
  buildExcludes: [/app-build-manifest\.json$/],

  runtimeCaching: [
    // APIs autenticadas: nunca servir resposta antiga de cache.
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

    // Navegação/documento: tenta a rede por até 3 s; depois usa a cópia local.
    // É esta regra que permite reabrir a Home instalada quando o aparelho está offline,
    // desde que a página tenha sido aberta online ao menos uma vez.
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pai-pages-v1",
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    // Fontes externas que ainda existirem no projeto.
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    // SDK do OneSignal: pode abrir usando a última cópia conhecida.
    {
      urlPattern: /^https:\/\/cdn\.onesignal\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "onesignal-cdn",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    // Imagens já visualizadas ficam disponíveis offline.
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "pai-images-v1",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30,
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
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 96, 128, 160, 180, 196, 256],
    domains: [
      "planoassistencialintegrado.com.br",
      "rp-master3-prod.s3.us-east-1.amazonaws.com",
      "images.unsplash.com",
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; img-src * blob: data:; media-src 'none'; script-src 'none'; sandbox;",
  },

  async rewrites() {
    return [
      {
        source: "/api/php/:path*",
        destination: "https://planoassistencialintegrado.com.br/:path*",
      },
    ];
  },
});
