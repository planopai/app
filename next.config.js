const withPWA = require("next-pwa")({
  dest: "public",

  // O registro é feito manualmente por components/RegisterSW.tsx.
  register: false,

  // A nova versão assume o controle assim que estiver pronta.
  skipWaiting: true,
  clientsClaim: true,

  scope: "/",
  sw: "sw.js",

  /*
   * Código adicional incorporado ao Service Worker gerado.
   * worker/index.js contém o Background Sync operacional.
   */
  customWorkerDir: "worker",

  /*
   * A Home é dinâmica porque depende de sessão/cookies.
   * O next-pwa cria a estratégia "start-url", e o RegisterSW
   * alimenta explicitamente esse cache depois que o usuário
   * abre o PWA autenticado com internet.
   */
  cacheStartUrl: true,
  dynamicStartUrl: true,

  /*
   * Continua ajudando nas navegações normais do Next quando online.
   * Para offline, RegisterSW converte links conhecidos em navegação
   * de documento, que é mais previsível com App Router.
   */
  cacheOnFrontEndNav: true,

  reloadOnOnline: false,

  disable:
    process.env.NODE_ENV === "development",

  cleanupOutdatedCaches: true,

  /*
   * Evita o problema histórico do next-pwa com app-build-manifest
   * em projetos que usam o diretório app.
   */
  buildExcludes: [
    /app-build-manifest\.json$/,
  ],

  runtimeCaching: [
    /*
     * Nunca servir respostas antigas das APIs autenticadas.
     * Dados offline serão tratados separadamente via IndexedDB.
     */
    {
      urlPattern: ({ url }) =>
        url.pathname.startsWith(
          "/api/php/"
        ),
      handler: "NetworkOnly",
      options: {
        cacheName:
          "api-php-network-only",
      },
    },

    {
      urlPattern: ({ url }) =>
        url.pathname.startsWith(
          "/push/"
        ),
      handler: "NetworkOnly",
      options: {
        cacheName:
          "push-network-only",
      },
    },

    /*
     * Requisições internas RSC do App Router.
     * Isto ajuda páginas que já foram navegadas online.
     * O caminho offline principal continua sendo uma navegação
     * de documento, feita pelo RegisterSW.
     */
    {
      urlPattern: ({
        request,
        url,
      }) =>
        request.headers.get(
          "RSC"
        ) === "1" ||
        url.searchParams.has("_rsc"),
      handler: "NetworkFirst",
      options: {
        cacheName: "pai-rsc-v1",
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds:
            60 * 60 * 24 * 7,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    /*
     * HTML das rotas da aplicação.
     *
     * O nome deste cache precisa permanecer igual a:
     * lib/offline/routes.ts -> PAI_PAGES_CACHE.
     */
    {
      urlPattern: ({ request }) =>
        request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pai-pages-v2",
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds:
            60 * 60 * 24 * 7,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    {
      urlPattern:
        /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds:
            60 * 60 * 24 * 365,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    {
      urlPattern:
        /^https:\/\/cdn\.onesignal\.com\/.*/i,
      handler:
        "StaleWhileRevalidate",
      options: {
        cacheName: "onesignal-cdn",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds:
            60 * 60 * 24 * 30,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },

    /*
     * Imagens já visualizadas continuam disponíveis.
     * Assets estáticos do build do Next entram no precache
     * gerado pelo Workbox.
     */
    {
      urlPattern: ({ request }) =>
        request.destination ===
        "image",
      handler: "CacheFirst",
      options: {
        cacheName:
          "pai-images-v1",
        expiration: {
          maxEntries: 150,
          maxAgeSeconds:
            60 * 60 * 24 * 30,
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
    formats: [
      "image/avif",
      "image/webp",
    ],

    deviceSizes: [
      360,
      414,
      640,
      768,
      1024,
      1280,
      1536,
      1920,
    ],

    imageSizes: [
      64,
      96,
      128,
      160,
      180,
      196,
      256,
    ],

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
        source:
          "/api/php/:path*",
        destination:
          "https://planoassistencialintegrado.com.br/:path*",
      },
    ];
  },
});
