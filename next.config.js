// next.config.js
/** @type {import('next').NextConfig} */

const withPWA = require('next-pwa')({
  dest: 'public',                 // gera sw.js em /public
  register: true,                 // registra SW automaticamente
  skipWaiting: false,             // vamos controlar via botão/UX se precisar
  disable: process.env.NODE_ENV === 'development',
  // evita incluir artefatos do Next que não fazem sentido no cache
  buildExcludes: [/middleware-manifest\.json$/],

  // Fallbacks offline
  fallbacks: {
    document: '/offline',         // precisa existir em /app/offline/page.tsx
    image: '/icons/icon-192.png', // fallback de imagem
    font: '/fonts/nunito-regular.woff2' // certifique-se de ter o arquivo
  },

  // Estratégias Workbox
  runtimeCaching: [
    // 1) Navegações (páginas)
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 dias
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 2) APIs do seu proxy (/api/php/**) — mesma origem no Vercel
    {
      urlPattern: /\/api\/php\/.*$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }, // 1 dia
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 3) Imagens (qualquer origem)
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'images-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 }, // 14 dias
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 4) Fontes do Google
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'fonts-cache',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1 ano
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 5) Arquivos estáticos gerados pelo Next
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/_next/static/'),
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 dias
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,

  // ✅ Não deixa o ESLint travar seu deploy (remova quando quiser “travar” de novo)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // (opcional) se você quiser tratar imagens remotas com <Image />
  // images: {
  //   remotePatterns: [
  //     { protocol: 'https', hostname: 'planoassistencialintegrado.com.br' },
  //   ],
  // },

  // (opcional) output standalone, útil pra containers
  // output: 'standalone',
});
